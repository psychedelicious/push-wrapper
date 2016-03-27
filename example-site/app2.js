const Push = require('../push.js'),
    foreach = require('lodash.foreach'),
    partial = require('lodash.partial'),
    Player = require('./player.js'),
    context = new AudioContext(),
    samples = [
        'https://dl.dropboxusercontent.com/s/h9sow482vkw06xe/dinky-kick.mp3',
        'https://dl.dropboxusercontent.com/s/kkikcupdg9n1qiy/dinky-snare.mp3',
        'https://dl.dropboxusercontent.com/s/d7jlxp5v4z0n62q/dinky-hat-2.mp3',
        'https://dl.dropboxusercontent.com/s/rblgnob6tvriudy/dinky-cym.mp3',
        'https://dl.dropboxusercontent.com/s/umm8cmrmn8n4a46/dinky-cym-noise.mp3'
    ];

var rate = [1, 1.5, 2, 0.5, 0.25];

window.addEventListener('load', () => {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess({ sysex: true })
            .then(Push.create_bound_to_web_midi_api)
            .then(off_we_go)
            .catch(function(error) { console.log(error.message) });
    } else {
        alert('No MIDI support in your browser');
    }
});

function off_we_go(bound_push) {
    const buttons = document.getElementsByClassName('button'),
        players = create_players(),
        push = bound_push;

    foreach(players, (player, i) => {
        player.on('started', partial(buttonClicked, buttons[i]));
        player.on('stopped', partial(buttonReleased, buttons[i]));
        buttons[i].addEventListener('mousedown', player.play);
    });

    bind_pitchbend(push, players);
}

function create_players() {
    var players = [];
    for (var  i = 0; i < samples.length; i++) {
        players[i] = new Player(samples[i], context);
    }
    return players;
}

function bind_pitchbend(push, players) {
    push.touchstrip.on('pitchbend', (pb) => {
        var rate = pb > 8192 ? pb / 4096 : pb / 8192;
        foreach(players, (player) => player.update_playback_rate(rate));
    });
}

function buttonClicked(ui_btn) {
    ui_btn.classList.add('active');
}

function buttonReleased(ui_btn) {
    ui_btn.classList.remove('active');
}