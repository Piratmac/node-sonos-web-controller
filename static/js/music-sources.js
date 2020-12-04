"use strict"

///
/// Socket events
///


Socket.renderFavorites = function(data) {
    renderFavorites(data);
}

Socket.renderTuneInRadios = function(data) {
    renderTuneInRadios(data);
};

Socket.renderPlaylists = function(data, parent) {
    renderPlaylists(data, parent);
};

///
/// Rendering
///

// Renders the favorites
function renderFavorites(favorites) {
    // Formatting the data in the expected way
    var favorites_folder = {
        'id': 'favorites',
        'children': [],
    };

    favorites.forEach(function(favorite, index) {
        var favorite_data = {
            'id': 'favorite-' + index.toString(),
            'title': favorite.title,
            'image': favorite.albumArtUri,
            'handler': playFavorite,
            'data': {
                'uri': favorite.uri,
            }
        }
        favorites_folder.children.push(favorite_data);
    });
    // Sort by title
    favorites_folder.children.sort((a, b) => ('' + a.title).localeCompare(b.title));

    renderMusicSources(favorites_folder);
}

// Renders the radio stations from TuneIn
function renderTuneInRadios(sources) {
    // Formatting the data in the expected way
    var radios_folder = {
        'id': sources.source_id,
        'children': [],
    };

    // Sort the stations / folders
    sources.data.sort(sortTuneInRadio)
    sources.data.forEach(function(child) {
        radios_folder.children.push(formatTuneInRadio(child, radios_folder.id));
    });

    renderMusicSources(radios_folder);
}

// Renders the playlists
function renderPlaylists(playlists, parent) {
    // Formatting the data in the expected way
    var playlists_folder = {
        'id': parent,
        'children': [],
    };

    playlists.forEach(function(playlist, index) {
        var playlist_data = {
            'id': 'playlist-' + index.toString(),
            'title': playlist.title,
            'handler': playPlaylist,
            'data': {
                'uri': playlist.uri,
            }
        }
        if (playlist.albumArtUri != undefined) {
            if (typeof playlist.albumArtUri == 'string')
                playlist_data.image = playlist.albumArtUri;
            else if (playlist.albumArtUri.length > 0)
                playlist_data.image = playlist.albumArtUri[0];
        }
        playlists_folder.children.push(playlist_data);
    });
    // Sort by title
    playlists_folder.children.sort((a, b) => ('' + a.title).localeCompare(b.title));

    renderMusicSources(playlists_folder);
}

// Formats a given level of TuneIn radio data
// There is a bit of recursivity to it, so it's easier in a separate function
function formatTuneInRadio(source, parent_id) {
    if (source['outline'] != undefined) {
        var group_id = parent_id + '-' + source['$'].key;
        var source_data = {
            'id': group_id,
            'title': source['$'].text,
            'children': [],
            'handler': displayTuneInRadios,
        };
        // Sort the stations / folders
        source['outline'].sort(sortTuneInRadio);
        source['outline'].forEach(function(child) {
            var temp = formatTuneInRadio(child, group_id);
            source_data.children.push(temp);
        });
    } else {
        source = source['$'];
        switch (source.type) {
            // This is a category with a link to get more data
            case 'link':
                if (source.key != undefined)
                    var element_id = source.key;
                else if (source.guide_id != undefined)
                    var element_id = source.guide_id;
                else if (source.text != undefined)
                    var element_id = source.text;

                var source_data = {
                    'id': parent_id + '-' + element_id,
                    'title': source.text,
                    'data': {
                        'uri': source.URL,
                    },
                    'handler': displayTuneInRadios,
                }
                break;

                // This is a radio station
            case 'audio':
                var source_data = {
                    'id': parent_id + '-' + source.preset_id,
                    'title': source.text,
                    'data': {
                        'id': source.preset_id,
                    },
                    'handler': playTuneInRadio,
                }
                break;
        }
        if (source.image) {
            source_data.image = source.image;
            source_data.data.image = source.image;
        }
    }
    return source_data;
}

// Renders several music sources
// sources should have the following elements:
// - id: unique ID of the source
// - children: one subelement for each child. see renderMusicSource for the format
function renderMusicSources(sources) {
    var currentFolder = document.getElementById(sources.id)
    var ul = currentFolder.getElementsByTagName("ul")[0];

    // Render all the children sources
    sources.children.forEach(function(child) {
        if (!document.getElementById(child.id))
            ul.appendChild(renderMusicSource(child));
        else
            document.getElementById(child.id).replaceWith(renderMusicSource(child));

        // Render the child's children, if any
        if (child.children)
            renderMusicSources(child);
    });
    currentFolder.appendChild(ul);
}

// Sorts first radios, then links - then uses alphabetic sort
function sortTuneInRadio(a, b) {
    if (a['$'].type == b['$'].type)
        return ('' + a['$'].text).localeCompare(b['$'].text);
    else
        return a['$'].type == "link";
}

// Renders an individual music source (radio, track, favorite, ...)
// source must have the following elements:
// - id: a unique ID used to identify the source
// - data: will populate the li.dataset (useful to store any data needed to process the source)
// - title: the title of the source. Will be displayed "as is"
// - image: the URL of the image to display. If missing, will use the default "missing album" art
function renderMusicSource(source) {
    var li = document.createElement('li');
    li.id = source.id;
    setDatasetAttributes(li, source.data);

    if (source.handler != undefined)
        li.addEventListener('dblclick', source.handler);
    else
        li.addEventListener('dblclick', openMusicSource);

    var title = document.createElement('span');
    title.textContent = source.title;

    var albumArt = document.createElement('img');
    if (source.image == undefined) {
        albumArt.src = './images/browse_missing_album_art.png';
    } else {
        if (source.image[0] == '/') {
            var prefix = (window.location.pathname != '/') ? window.location.pathname : '';
            albumArt.src = prefix + source.image;
        } else
            albumArt.src = source.image;
    }

    li.appendChild(albumArt);
    li.appendChild(title);

    if (source.children != undefined) {
        var ul = document.createElement("ul");
        ul.classList.add("hidden");
        li.appendChild(ul);
    }

    return li;
}

///
/// GUI events
///

// Finds the actionable element
// The parameter can be:
// - the ID of the element => returns the object with that ID
// - an Event => returns the object on which the event is attached
// - an objet => returns the object itself
function findMusicSourceNode(element) {
    if (typeof element == 'string')
        return document.getElementById(element);
    else if (element instanceof Event)
        return element.currentTarget;
    else
        return element;
}

// Sets all dataset attributes of an element based on a dict
function setDatasetAttributes(el, attrs) {
    for (var key in attrs) {
        el.setAttribute('data-' + key, attrs[key]);
    }
}

// This will display a given folder and its siblings
document.getElementById('music-sources-backlink').addEventListener('dblclick', function(e) {
    closeMusicSource(e.target.dataset.pwd);
});

// Opens one of the music sources folder
document.getElementById('favorites').addEventListener('dblclick', e => browseMusicSource (e, 'favorites'));
document.getElementById('playlists').addEventListener('dblclick', e => browseMusicSource (e, 'playlists'));
document.getElementById('library-playlists').addEventListener('dblclick', e => browseMusicSource (e, 'library-playlists'));

document.getElementById('tune-in').addEventListener('dblclick', displayTuneInRadios);

// Opens a music source folder & emits socket event if there are no children
function browseMusicSource (e, socketMessage) {
    var currentFolder = findMusicSourceNode(e);

    // If we don't have any subelement, trigger the socket for search
    var children = currentFolder.getElementsByTagName("ul");
    if (children.length == 0)
        Socket.socket.emit(socketMessage);

    openMusicSource(currentFolder);
}

// Displays a radio, and sends a socket message if we don't have the details yet
function displayTuneInRadios(e) {
    var currentFolder = findMusicSourceNode(e)

    // If we don't have any subelement, trigger the socket for search
    var children = currentFolder.getElementsByTagName("ul");
    if (children.length == 0)
        Socket.socket.emit('tune-in-radio', {
            uri: currentFolder.dataset.uri,
            source_id: currentFolder.id,
        });

    openMusicSource(currentFolder);
    e.stopPropagation();
}

// Opens a given folder
// This will only modify some classes to display/hide stuff and update the header
function openMusicSource(folder) {
    var currentFolder = findMusicSourceNode(folder)

    // Update the header
    var folderName = currentFolder.getElementsByTagName("span")[0].textContent;
    var header = document.getElementById('music-sources-container');
    header.getElementsByTagName("h4")[0].textContent = folderName.toUpperCase();

    // Create the ul element we'll use to include all children (if needed)
    if (currentFolder.getElementsByTagName("ul").length == 0) {
        var ul = document.createElement('ul');
        currentFolder.appendChild(ul);
    }

    // Update the backlink button
    document.getElementById('music-sources-backlink').dataset.pwd = currentFolder.id;
    document.getElementById('music-sources-backlink').classList.remove('hidden');

    // Hiding all other objects in the menu
    var siblings = Array.prototype.slice.call(currentFolder.parentNode.childNodes);
    siblings.forEach(function(nodeElement) {
        if (nodeElement == currentFolder) return;
        if (nodeElement.nodeType != 1) return; // Excludes text
        nodeElement.classList.add('hidden');
    });

    // Hide the folder we're currently viewing & display its children
    var children = Array.prototype.slice.call(currentFolder.childNodes);
    children.forEach(function(child) {
        if (child.nodeType != 1) return; // Excludes text
        switch (child.tagName) {
            case 'SPAN':
            case 'IMG':
                child.classList.add('hidden');
                break;

            case 'UL':
                child.classList.remove('hidden');
                break;
        }
    });
    // This prevents having a double hover effect (since the parent is still visible)
    currentFolder.classList.add('nobackground');
}

// Closes a given folder
// This will only modify some classes to display/hide stuff and update the header
function closeMusicSource(folder) {
    var currentFolder = findMusicSourceNode(folder)

    // Update the header with the parent's data
    var parentFolder = currentFolder.parentNode.parentNode
    if (parentFolder.tagName != 'LI') // This means we reached the top element
        parentFolder = currentFolder.parentNode
    var folderName = parentFolder.getElementsByTagName("span")[0].textContent;
    var header = document.getElementById('music-sources-container');
    header.getElementsByTagName("h4")[0].textContent = folderName.toUpperCase();

    // Update the backlink button
    document.getElementById('music-sources-backlink').dataset.pwd = parentFolder.id;
    if (parentFolder.id == 'music-sources')
        // If we reached the top, we hide the backlink
        document.getElementById('music-sources-backlink').classList.add('hidden');

    // Display all the siblings
    var siblings = Array.prototype.slice.call(currentFolder.parentNode.childNodes);
    siblings.forEach(function(nodeElement) {
        if (nodeElement.nodeType != 1) return; // Excludes text
        nodeElement.classList.remove('hidden');
    });

    // Hide the contents of folder we're currently viewing & display its title & image
    var children = Array.prototype.slice.call(currentFolder.childNodes);
    children.forEach(function(child) {
        if (child.nodeType != 1) return; // Excludes text
        switch (child.tagName) {
            case 'SPAN':
            case 'IMG':
                child.classList.remove('hidden');
                break;

            case 'UL':
                child.classList.add('hidden');
                break;
        }
    });

    // Add the background effects
    currentFolder.classList.remove('nobackground');
}

// Double-click on a favorite
function playFavorite(e) {
    var eventFavorite = findMusicSourceNode(e);
    var favoriteName = eventFavorite.getElementsByTagName("span")[0].textContent;

    Socket.socket.emit('play-favorite', {
        uuid: Sonos.currentState.selectedZone,
        favorite: favoriteName
    });
}

// Double-click on a radio
function playTuneInRadio(e) {
    var eventRadio = findMusicSourceNode(e);
    var radioName = eventRadio.getElementsByTagName("span")[0].textContent;

    Socket.socket.emit('play-tune-in-radio', {
        uuid: Sonos.currentState.selectedZone,
        id: eventRadio.dataset.id,
        title: radioName,
        image: eventRadio.dataset.image,
    });
}

// Double-click on a playlist
function playPlaylist(e) {
    var eventPlaylist = findMusicSourceNode(e);
    var playlistTitle = eventPlaylist.getElementsByTagName("span")[0].textContent;

    if (eventPlaylist.parentNode.parentNode.id == 'playlists')
        var socketMessage = 'play-playlist'
    else
        var socketMessage = 'play-library-playlist'

    Socket.socket.emit(socketMessage, {
        uuid: Sonos.currentState.selectedZone,
        id: eventPlaylist.dataset.id,
        title: playlistTitle,
    });
}
