"use strict"

///
/// Socket events
///


Socket.renderFavorites = function(data) {
    renderFavorites(data);
    hideLoading();
}

Socket.renderTuneInRadios = function(data) {
    renderTuneInRadios(data);
    hideLoading();
};

Socket.renderPlaylists = function(data) {
    renderPlaylists(data);
    hideLoading();
};

Socket.renderLibraryItems = function(data) {
    renderLibraryItems(data);
    hideLoading();
};

Socket.renderSearchResults = function(data) {
    renderSearchResults(data);
    hideLoading();
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
            'handlers': {
                'play': playFavorite,
                'open': playFavorite,
            },
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
function renderPlaylists(playlists) {
    // Formatting the data in the expected way
    var playlists_folder = {
        'id': 'playlists',
        'children': [],
    };

    playlists.forEach(function(playlist, index) {
        var playlist_data = {
            'id': 'playlist-' + index.toString(),
            'title': playlist.title,
            'handlers': {
                'dblclick': openMusicSource,
                'play': playPlaylist,
            },
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

// Renders library items
function renderLibraryItems(data) {
    // Formatting the data in the expected way
    var superior_folder = {
        'id': data.parent,
        'children': [],
    };

    var items = data.items;
    var letters = [...new Set(items.map((item) => item.title[0].toUpperCase()))];
    var letter = '';
    letters.sort()

    if (data.numberReturned <= 50) {
        items.forEach(function(item, index) {
            var item_data = formatLibraryItem(superior_folder.id, item, index);
            superior_folder.children.push(item_data);
        });
    }
    else {
        var folders = []
        letters.forEach((letter) => folders.push({
                'id': superior_folder.id + '-' + letter,
                'title': letter.toUpperCase(),
                'children': [],
                'data':{}
            }));
        items.forEach(function(item, index) {
            letter = item.title[0].toUpperCase()
            var item_data = formatLibraryItem(superior_folder.id + '-' + letter, item, index);
            folders[letters.indexOf(letter)].children.push(item_data);
        });

        folders.forEach((folder) => folder.children.sort((a, b) => ('' + a.title).localeCompare(b.title)));

        superior_folder.children = folders;
    }

    // Sort by title
    superior_folder.children.sort((a, b) => ('' + a.title).localeCompare(b.title));
    renderMusicSources(superior_folder);
}

// Formats a library item data so that it matches renderMusicSources' format
function formatLibraryItem(parent_id, item, index) {
    var item_data = {
        'id': parent_id + '-' + index.toString(),
        'title': item.title,
        'handlers': {},
        'data': {
            'uri': item.uri,
        }
    }
    if (item.albumArtUri != undefined)
        item_data.image = item.albumArtUri;
    if (item.artist != undefined)
        item_data.artist = item.artist;

    // If ID is defined, it means there are levels below
    if (item.id != undefined) {
        item_data.handlers.open = browseMusicLibrary;
        item_data.handlers.play = playLibraryItem;
        item_data.handlers.add_to_queue = addToQueue;
        item_data.data['browse-path'] = item.id;
    }
    else {
        item_data.handlers.open = playLibraryItem;
        item_data.handlers.play = playLibraryItem;
        item_data.handlers.add_to_queue = addToQueue;
    }

    return item_data;
}


// Displays search results
function renderSearchResults (data) {
    // Displays the main folder (which is hidden by default)
    var searchFolder = document.getElementById('search-result')
    searchFolder.classList.remove("hidden");
    searchFolder.classList.remove("no-result");

    // Clear all previous search results + create "ul" if needed
    var children = Array.prototype.slice.call(searchFolder.getElementsByTagName("ul")[0].children);
    children.forEach((folder) => {
        if (folder.getElementsByTagName("ul").length == 0)
            folder.appendChild(document.createElement('ul'));
        else {
            var folder_ul = folder.getElementsByTagName("ul")[0];
            while (folder_ul.firstChild != undefined)
                folder_ul.removeChild(folder_ul.firstChild);
        }
    });

    // Close properly the currently opened folder
    var open_folder = document.getElementById('music-sources-backlink').dataset.pwd;
    if (open_folder != undefined) {
        while (open_folder != 'music-sources-container') {
            closeMusicSource(open_folder);
            open_folder = document.getElementById('music-sources-backlink').dataset.pwd;
        }
    }

    openMusicSource("search-result");

    data.forEach((category) => {
        var category_folder_name = searchFolder.id + '-' + category.type.toLowerCase();
        var category_folder = document.getElementById(category_folder_name);
        if (category.numberReturned == 0) {
            category_folder.classList.add('no-result');
            return
        }
        category_folder.classList.remove('hidden');
        category_folder.classList.remove('no-result');
        renderLibraryItems({0: category}, "search-result-" + category.type.toLowerCase());
        category_folder.getElementsByTagName("ul")[0].classList.add('hidden');
    });
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
            'handlers': {
                'open': displayTuneInRadios,
            }
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
                    'handlers': {
                        'open': displayTuneInRadios,
                    }
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
                    'handlers': {
                        'play': playTuneInRadio,
                    }
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
    var ul = currentFolder.getElementsByTagName("ul")[0] || document.createElement('ul');

    // Render all the children sources
    sources.children.forEach(function(child, index) {
        if (!document.getElementById(child.id))
            ul.appendChild(renderMusicSource(child, index >= 20));
        else
            document.getElementById(child.id).replaceWith(renderMusicSource(child, index >= 20));

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
// It may have additional information:
// - handlers: which function to call in different cases (open, play, add_to_queue)
// - artist: the artist's name (will not be displayed if missing)
// - image: the URL of the image to display. If missing, will use the default "missing album" art
function renderMusicSource(source, lazyLoadImages = true) {
    var li = document.createElement('li');
    li.id = source.id;
    setDatasetAttributes(li, source.data);

    // Adding the images & handlers for different actions
    if (source.handlers) {
        if (source.handlers.open)
            li.addEventListener('dblclick', source.handlers.open);
        var divActions = document.createElement('div');
        if (source.handlers.play) {
            var imgAction = document.createElement('img');
            imgAction.src = 'images/sources_action_play.png';
            imgAction.alt = 'Play';
            imgAction.addEventListener('dblclick', source.handlers.play);
            divActions.appendChild(imgAction);
        }
        if (source.handlers.add_to_queue) {
            var imgAction = document.createElement('img');
            imgAction.src = 'images/sources_action_add_to_queue.png';
            imgAction.alt = 'Add to queue';
            imgAction.addEventListener('dblclick', source.handlers.add_to_queue);
            divActions.appendChild(imgAction);
        }
        // If we have any action element
        if (divActions.children.length) {
            divActions.classList.add('actions');
            li.appendChild(divActions);
        }
    }
    else {
        li.addEventListener('dblclick', openMusicSource);
    }

    // Source artist & title
    if (source.artist == undefined) {
        var itemInfo = document.createElement('span');
        itemInfo.textContent = source.title;
    }
    else {
        var itemInfo = document.createElement('div');
        var title = document.createElement('p');
        title.className = 'title';
        title.textContent = source.title;
        itemInfo.appendChild(title);

        var artist = document.createElement('p');
        artist.className = 'artist';
        artist.textContent = source.artist;
        itemInfo.appendChild(artist);
    }


    // Image
    var albumArt = document.createElement('img');
    if (source.image == undefined) {
        albumArt.src = './images/browse_missing_album_art.png';
    } else {
        // Handle servers which are not at the root of the server
        if (source.image[0] == '/')
            var prefix = (window.location.pathname != '/') ? window.location.pathname : '';
        else
            var prefix = '';

        if (lazyLoadImages)
            albumArt.dataset.src = prefix + source.image;
        else {
            albumArt.src = prefix + source.image;
        }
    }

    li.appendChild(albumArt);
    li.appendChild(itemInfo);

    // Children elements
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
        var target = element.currentTarget;
    else
        var target = element;

    while (target.tagName.toUpperCase() != 'LI')
        target = target.parentNode;

    return target;
}

// Finds the label to display for a given folder
// The element should be a <li> tag
function getFolderLabel(element) {
    if (element.getElementsByTagName("span").length)
        var folderName = element.getElementsByTagName("span")[0].textContent;
    else
        var folderName = element.getElementsByTagName("p")[0].textContent;

    return folderName;
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

// This will lazy-load images from the music sources list
document.getElementById('music-sources').addEventListener('scroll', function(e) {
    var scrollTimeout;
    clearTimeout(scrollTimeout);
    var _this = this;
    scrollTimeout = setTimeout(function() {
        lazyLoadImages(_this);
    }, 150);

});

// Opens one of the music sources folder
document.getElementById('favorites').addEventListener('dblclick', e => browseMusicSource (e, 'favorites'));
document.getElementById('playlists').addEventListener('dblclick', e => browseMusicSource (e, 'playlists'));
document.getElementById('library').addEventListener('dblclick', e => browseMusicLibrary (e));
var library_item_types = ['album', 'albumartist', 'artist', 'composer', 'genre', 'playlists', 'tracks'];
library_item_types.forEach(function (type) {
    document.getElementById('library-'+type).addEventListener('dblclick', e => browseMusicLibrary (e));
});

document.getElementById('search-result').addEventListener('dblclick', e => browseMusicSource (e));
library_item_types.forEach(function (type) {
    document.getElementById('search-result-'+type).addEventListener('dblclick', e => browseMusicSource (e));
});


document.getElementById('tune-in').addEventListener('dblclick', displayTuneInRadios);

// Opens an element from the library
function browseMusicLibrary (e) {
    var currentFolder = findMusicSourceNode(e);

    browseMusicSource(e, 'library', {
        'parent': currentFolder.id,
        'browsePath': currentFolder.dataset.browsePath || "",
    });
}

// Opens a music source folder & emits socket event if there are no children
function browseMusicSource (e, socketMessage = '', data = '') {
    var currentFolder = findMusicSourceNode(e);

    // If we don't have any subelement, trigger the socket for search
    var children = currentFolder.getElementsByTagName("ul");
    if (children.length == 0 && socketMessage != '') {
        Socket.socket.emit(socketMessage, data);
        displayLoading();
    }

    openMusicSource(currentFolder);
    e.stopPropagation();
}

// Displays a radio, and sends a socket message if we don't have the details yet
function displayTuneInRadios(e) {
    var currentFolder = findMusicSourceNode(e)

    // If we don't have any subelement, trigger the socket for search
    var children = currentFolder.getElementsByTagName("ul");
    if (children.length == 0) {
        Socket.socket.emit('tune-in-radio', {
            uri: currentFolder.dataset.uri,
            source_id: currentFolder.id,
        });
        displayLoading();
    }

    openMusicSource(currentFolder);
    e.stopPropagation();
}

// Opens a given folder
// This will only modify some classes to display/hide stuff and update the header
function openMusicSource(e) {
    var currentFolder = findMusicSourceNode(e)

    // Update the header
    var folderName = getFolderLabel(currentFolder);
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
            case 'DIV':
                child.classList.add('hidden');
                break;

            case 'UL':
                child.classList.remove('hidden');
                break;
        }
    });
    // This prevents having a double hover effect (since the parent is still visible)
    currentFolder.classList.add('nobackground');

    if (e.stopPropagation)
        e.stopPropagation();
}

// Closes a given folder
// This will only modify some classes to display/hide stuff and update the header
function closeMusicSource(folder) {
    var currentFolder = findMusicSourceNode(folder)

    // Update the header with the parent's data
    var parentFolder = currentFolder.parentNode.parentNode
    if (parentFolder.tagName != 'LI') // This means we reached the top element
        parentFolder = currentFolder.parentNode
    var folderName = getFolderLabel(parentFolder);
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
            case 'DIV':
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

// Play a favorite
function playFavorite(e) {
    var eventItem = findMusicSourceNode(e);
    var itemTitle = getFolderLabel(eventItem);

    Socket.socket.emit('play-favorite', {
        uuid: Sonos.currentState.selectedZone,
        favorite: itemTitle
    });
    e.stopPropagation();
}

// Play a radio
function playTuneInRadio(e) {
    var eventItem = findMusicSourceNode(e);
    var itemTitle = getFolderLabel(eventItem);

    Socket.socket.emit('play-tune-in-radio', {
        uuid: Sonos.currentState.selectedZone,
        id: eventItem.dataset.id,
        title: itemTitle,
        image: eventItem.dataset.image,
    });
    e.stopPropagation();
}

// Play a playlist
function playPlaylist(e) {
    var eventItem = findMusicSourceNode(e);
    var itemTitle = getFolderLabel(eventItem);

    Socket.socket.emit('play-playlist', {
        uuid: Sonos.currentState.selectedZone,
        id: eventItem.dataset.id,
        title: itemTitle,
    });
    e.stopPropagation();
}

// Play a library item
function playLibraryItem(e) {
    var eventItem = findMusicSourceNode(e);
    var itemTitle = getFolderLabel(eventItem);

    Socket.socket.emit('play-library-item', {
        uuid: Sonos.currentState.selectedZone,
        id: eventItem.dataset.id,
        uri: eventItem.dataset.uri,
        title: itemTitle,
    });
    e.stopPropagation();
}

// Add an element to the queue
function addToQueue(e) {
    var eventItem = findMusicSourceNode(e);
    var itemTitle = getFolderLabel(eventItem);

    Socket.socket.emit('add-to-queue', {
        uuid: Sonos.currentState.selectedZone,
        uri: eventItem.dataset.uri,
        title: itemTitle,
    });
    e.stopPropagation();
}
