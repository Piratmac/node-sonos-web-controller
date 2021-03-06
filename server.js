'use strict';
const http = require('http');
const StaticServer = require('node-static').Server;
const io = require('socket.io');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const crypto = require('crypto');
const async = require('async');
const SonosDiscovery = require('sonos-discovery');
const settings = {
    port: 8080,
    cacheDir: './cache'
}

try {
    const userSettings = require(path.resolve(__dirname, 'settings.json'));
    for (var i in userSettings) {
        settings[i] = userSettings[i];
    }
} catch (e) {
    console.log('no settings file found, will only use default settings');
}

var discovery = new SonosDiscovery(settings);

var cacheDir = path.resolve(__dirname, settings.cacheDir);
var missingAlbumArt = path.resolve(__dirname, './lib/browse_missing_album_art.png');

var fileServer = new StaticServer(path.resolve(__dirname, 'static'));

var queues = {};

fs.mkdir(cacheDir, function(e) {
    if (e && e.code != 'EEXIST')
        console.log('creating cache dir failed!', e);
});

var server = http.createServer(function(req, res) {
    settings.acceptLanguage = req.headers['accept-language'];

    if (/^\/getaa/.test(req.url)) {
        // this is a resource, download from player and put in cache folder
        var md5url = crypto.createHash('md5').update(req.url).digest('hex');
        var fileName = path.join(cacheDir, md5url);

        fs.access(fileName, function(error) {
            if (!error) {
                var readCache = fs.createReadStream(fileName);
                readCache.pipe(res);
                return;
            }

            const player = discovery.getAnyPlayer();
            if (!player) return;

            console.log('fetching album art from', player.uuid);
            http.get(`${player.baseUrl}${req.url}`, function(res2) {
                console.log(res2.statusCode);
                if (res2.statusCode == 200) {
                    fs.access(fileName, function(error) {
                        if (error) {
                            var cacheStream = fs.createWriteStream(fileName);
                            res2.pipe(cacheStream);
                        } else {
                            res2.resume();
                        }
                    });


                } else if (res2.statusCode == 404) {
                    // no image exists! link it to the default image.
                    console.log(res2.statusCode, 'linking', fileName)
                    fs.link(missingAlbumArt, fileName, function(e) {
                        res2.resume();
                        if (e) console.log(e);
                    });
                }

                res2.on('end', function() {
                    console.log('serving', req.url);
                    var readCache = fs.createReadStream(fileName);
                    readCache.on('error', function(e) {
                        console.log(e);
                    });
                    readCache.pipe(res);
                });
            }).on('error', function(e) {
                console.log("Got error: " + e.message);
            });
        });
    } else {
        req.addListener('end', function() {
            fileServer.serve(req, res);
        }).resume();
    }
});

var socketServer = io.listen(server);

socketServer.sockets.on('connection', function(socket) {
    // Send it in a better format
    const players = discovery.players;

    if (players.length == 0) return;

    socket.emit('topology-change', players);

    socket.on('transport-state', function(data) {
        // find player based on uuid
        const player = discovery.getPlayerByUUID(data.uuid);

        if (!player) return;

        // invoke action
        //console.log(data)
        player[data.state]();
    });

    socket.on('group-volume', function(data) {
        // find player based on uuid
        const player = discovery.getPlayerByUUID(data.uuid);
        if (!player) return;

        // invoke action
        player.setGroupVolume(data.volume);
    });

    socket.on('group-management', function(data) {
        // find player based on uuid
        console.log(data)
        const player = discovery.getPlayerByUUID(data.player);
        if (!player) return;

        if (data.group == null) {
            player.becomeCoordinatorOfStandaloneGroup();
            return;
        }

        player.setAVTransport(`x-rincon:${data.group}`);
    });

    socket.on('favorites', function(data) {
        discovery.getFavorites()
            .then((favorites) => {
                socket.emit('favorites', favorites);
            });
    });

    socket.on('play-favorite', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (!player) return;

        player.replaceWithFavorite(data.favorite)
            .then(() => player.play())
            .catch((error) => console.log(error));
    });

    socket.on('queue', function(data) {
        loadQueue(data.uuid)
            .then(queue => {
                socket.emit('queue', {
                    uuid: data.uuid,
                    queue
                });
            });
    });

    socket.on('seek', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (player.avTransportUri.startsWith('x-rincon-queue')) {
            player.trackSeek(data.trackNo);
            return;
        }

        // Player is not using queue, so start queue first
        player.setAVTransport('x-rincon-queue:' + player.uuid + '#0')
            .then(() => player.trackSeek(data.trackNo))
            .then(() => player.play());
    });

    socket.on('playmode', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        for (var action in data.state) {
            player[action](data.state[action]);
        }
    });

    socket.on('volume', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        player.setVolume(data.volume);
    });

    socket.on('group-mute', function(data) {
        console.log(data)
        var player = discovery.getPlayerByUUID(data.uuid);
        if (data.mute)
            player.muteGroup();
        else
            player.unMuteGroup();
    });

    socket.on('mute', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (data.mute)
            player.mute();
        else
            player.unMute();
    });

    socket.on('track-seek', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        player.timeSeek(data.elapsed);
    });

    socket.on('search', function(data) {
        search(data.term, 'search-result', socket);
    });

    socket.on("error", function(e) {
        console.error(e);
    })

    socket.on('tune-in-radio', function(data) {
        if (data.uri == undefined)
            throw new Error('Received radio request without URI');

        var requestdata = new URL(data.uri);
        var headers = {
            'Accept-Language': settings.acceptLanguage
        }; // Allows to fetch data in the user's language directly

        var request = http.request(requestdata, {
            'headers': headers
        }, function(response) {
            var sourcesXML = '';
            console.log("Radio: Got response " + response.statusCode);
            response.on("data", function(chunk) {
                sourcesXML += chunk;
            });
            response.on('end', function() {
                xml2js.parseString(sourcesXML, function(error, result) {
                    if (error != undefined) {
                        console.log("Got error: " + error.message);
                        return;
                    }
                    socket.emit('tune-in-radio', {
                        uri: data.uri,
                        source_id: data.source_id,
                        title: result.opml.head[0].title[0],
                        data: result.opml.body[0].outline
                    })
                });
            });
        });
        request.on('error', function(error) {
            console.log("Got error: " + error.message);
        });
        request.end();
    });

    socket.on('play-tune-in-radio', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (!player) return;

        player.replaceWithTuneInRadio(data)
            .then(() => player.play())
            .catch((error) => console.log(error));
    });

    socket.on('playlists', function(data) {
        discovery.getPlaylists()
            .then(data => socket.emit('playlists', data))
            .catch((error) => console.log(error));
    });

    socket.on('play-playlist', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (!player) return;

        player.replaceWithPlaylist(data.title)
            .then(() => player.play())
            .catch((error) => console.log(error));
    });

    socket.on('library', function (data) {
        browse(data.browsePath, 'library', socket, data.parent);
    });

    socket.on('play-library-item', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (!player) return;

        player.replaceWithURI(data.uri, '')
            .then((data) => player.setAVTransport(data.uri))
            .then(() => player.play())
            .catch((error) => console.log(error));
    });

    socket.on('add-to-queue', function(data) {
        var player = discovery.getPlayerByUUID(data.uuid);
        if (!player) return;

        player.addURIToQueue(data.uri, '')
            .catch((error) => console.log(error));

        if (player.state.currentTrack.type == 'radio') {
            player.setAVTransport(`x-rincon-queue:${data.uuid}#0`)
                .then(() => player.play())
                .catch((error) => console.log(error));;
        }
    });
});

discovery.on('topology-change', function(data) {
    socketServer.sockets.emit('topology-change', discovery.players);
});

discovery.on('transport-state', function(data) {
    socketServer.sockets.emit('transport-state', data);
});

discovery.on('group-volume', function(data) {
    socketServer.sockets.emit('group-volume', data);
});

discovery.on('volume-change', function(data) {
    socketServer.sockets.emit('volume', data);
});

discovery.on('group-mute', function(data) {
    socketServer.sockets.emit('group-mute', data);
});

discovery.on('mute-change', function(data) {
    socketServer.sockets.emit('mute', data);
});

discovery.on('favorites', function(data) {
    socketServer.sockets.emit('favorites', data);
});

discovery.on('queue-change', function(player) {
    console.log('queue-changed', player.roomName);
    delete queues[player.uuid];
    loadQueue(player.uuid)
        .then(queue => {
            socketServer.sockets.emit('queue', {
                uuid: player.uuid,
                queue
            });
        });
});

function loadQueue(uuid) {
    if (queues[uuid]) {
        return Promise.resolve(queues[uuid]);
    }

    const player = discovery.getPlayerByUUID(uuid);
    return player.getQueue()
        .then(queue => {
            queues[uuid] = queue;
            return queue;
        });
}

function browse(browsePath, response, socket, parentId) {
    console.log('Browsing', browsePath);
    var playerCycle = 0;
    var players = [];

    for (var i in discovery.players) {
        players.push(discovery.players[i]);
    }

    function getPlayer() {
        var player = players[playerCycle++ % players.length];
        return player;
    }

    var searchFunction = function(callback) {
        var player = getPlayer();
        //console.log('fetching', this.type, 'from', player.uuid)
        browsePath = browsePath.replace('<', '&lt;').replace('>', '&gt;').replace('&', '&amp;');
        player.browse(browsePath, 0, 600)
            .then((data) => {
                data.parent = parentId;
                callback(null, data)
            })
            .catch((error) => console.log(error));
    }

    var results = {}
    searchFunction(function(err, results) {
        socket.emit(response, results);
    });
}

function search(term, response, socket) {
    console.log('search for', term);
    var playerCycle = 0;
    var players = [];

    for (var i in discovery.players) {
        players.push(discovery.players[i]);
    }

    function getPlayer() {
        var player = players[playerCycle++ % players.length];
        return player;
    }

    var search_types = ['ALBUM', 'ALBUMARTIST', 'ARTIST', 'COMPOSER', 'GENRE', 'PLAYLISTS', 'TRACKS'];
    var searchFunction = function(callback) {
        var player = getPlayer();
        this.term = this.term.replace('<', '&lt;').replace('>', '&gt;').replace('&', '&amp;');
        var searchSentence = 'A:' + this.type + ':' + this.term;
        console.log('fetching', searchSentence, 'from', player.uuid)
        player.browse(searchSentence, 0, 600)
            .then((data) => {
                data.type = this.type;
                data.term = this.term;
                callback(null, data)
            })
            .catch((error) => console.log(error));
    }

    var searchFunctions = [];
    var type = '';
    for (type in search_types)
        searchFunctions.push(searchFunction.bind({'type': search_types[type].toUpperCase(), 'term': term}));

    var results = {}
    async.parallelLimit(searchFunctions, players.length, function(err, results) {
        socket.emit(response, results);
    });
}

// Attach handler for socket.io

server.listen(settings.port);

console.log("http server listening on port", settings.port);
