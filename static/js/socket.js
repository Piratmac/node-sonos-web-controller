"use strict";
///
/// socket events
///

var Socket = Socket || {};

var target = location.origin;
var path = location.pathname;
if (path.substr(-3) == '/m/') path = path.substr(0, path.length - 2);
Socket.socket = io.connect(target, {
    'path': path + 'socket.io/'
});

Socket.socket.on('topology-change', function(data) {
    Sonos.grouping = {};
    var stateTime = new Date().valueOf();
    var shouldRenderVolumes = false;
    data.forEach(function(player) {
        player.stateTime = stateTime;
        Sonos.players[player.uuid] = player;
        if (!Sonos.grouping[player.coordinator]) Sonos.grouping[player.coordinator] = [];
        Sonos.grouping[player.coordinator].push(player.uuid);
    });

    // If the selected group dissappeared, select a new one.
    if (!Sonos.grouping[Sonos.currentState.selectedZone]) {
        // just get first zone available
        for (var uuid in Sonos.grouping) {
            Sonos.currentState.selectedZone = uuid;
            break;
        }
        // we need queue as well!
        Socket.socket.emit('queue', {
            uuid: Sonos.currentState.selectedZone
        });
        shouldRenderVolumes = true;
    }

    if (Socket.topologyChanged instanceof Function) Socket.topologyChanged(shouldRenderVolumes);
});

Socket.socket.on('transport-state', function(player) {
    player.stateTime = new Date().valueOf();
    Sonos.players[player.uuid] = player;

    if (Socket.transportStateChanged instanceof Function) Socket.transportStateChanged(player);

});

Socket.socket.on('group-volume', function(data) {
    if (Socket.groupVolumeChanged instanceof Function) Socket.groupVolumeChanged(data);
});

Socket.socket.on('volume', function(data) {
    if (Socket.volumeChanged instanceof Function) Socket.volumeChanged(data);
});

Socket.socket.on('group-mute', function(data) {
    Sonos.players[data.uuid].groupState.mute = data.newMute;
    if (Socket.groupMuteChanged instanceof Function) Socket.groupMuteChanged(data);
});

Socket.socket.on('mute', function(data) {
    if (Socket.muteChanged instanceof Function) Socket.muteChanged(data);
});

Socket.socket.on('favorites', function(data) {
    if (Socket.renderFavorites instanceof Function) Socket.renderFavorites(data);
});

Socket.socket.on('queue', function(data) {
    if (Socket.queueChanged instanceof Function) Socket.queueChanged(data);
});


Socket.socket.on('search-result', function(data) {
    if (Socket.searchResultReceived instanceof Function) Socket.searchResultReceived(data);
})

Socket.socket.on('tune-in-radio', function(data) {
    if (Socket.renderTuneInRadios instanceof Function) Socket.renderTuneInRadios(data);
})