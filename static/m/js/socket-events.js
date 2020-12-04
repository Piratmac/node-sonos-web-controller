"use strict";
///
/// socket events
///
Socket.topologyChanged = function() {
    GUI.updateCurrentStatus();
    GUI.renderVolumes();
}

Socket.transportStateChanged = function(player) {
    GUI.updateCurrentStatus();
}

Socket.groupVolumeChanged = function(data) {
    if (data.uuid == Sonos.currentState.selectedZone) {
        GUI.masterVolume.setVolume(data.groupState.volume);
    }
    for (var uuid in data.playerVolumes) {
        Sonos.players[data.uuid].state.volume = data.playerVolumes[uuid];
        //GUI.playerVolumes[uuid].setVolume(data.playerVolumes[uuid]);
    }
}