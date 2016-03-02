// Example script that creates and uses Push

const Push = require('./push.js'),
    foreach = require('lodash.foreach'),
    partial = require('lodash.partial');

window.addEventListener('load', function() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess({ sysex: false })
            .then(Push.create_bound_to_web_midi_api)
            .then(off_we_go)
            .catch(console.error);
    } else {
        alert('No MIDI support in your browser');
    }
});

function off_we_go(bound_push) {
    const push = bound_push;
    push.knobs.one.on('turned', function(delta) {console.log('knob 1: ' + delta)});
    push.buttons.play.on('pressed', function() {
        push.buttons.play.led_on();
        player(60, 127);
    });
    push.buttons.play.on('released', function() {
        push.buttons.play.led_off();
        player(60, 0);
    });

    foreach([0, 1, 2, 3, 4], partial(bind_column_to_sample, push))
}

function light_up_column(push, x, velocity) {
    foreach([0, 1, 2, 3, 4, 5, 6, 7], function(y) {
        if ((velocity / 8) >= y) {
            push.grid.x[x].y[y].led_on(velocity);
        } else {
            push.grid.x[x].y[y].led_off();
        }
    })
}

function turn_off_column(push, x) {
    foreach([1, 2, 3, 4, 5, 6, 7], function(y) {
        push.grid.x[x].y[y].led_off();
    });
    push.grid.x[x].y[0].led_on();
}

// all buttons in the same grid column play the same note
// the higher up the grid, the higher the LP filter frequency
// note grid LEDs only turn off when all buttons in column released
function bind_column_to_sample(push, x) {
    var column_count = 0;
    foreach([0, 1, 2, 3, 4, 5, 6, 7], function(y) {
        var grid_button = push.grid.y[y].x[x];
        grid_button.on('pressed', function(velocity) {
            light_up_column(push, x, velocity);
            player(x + 60, velocity, (y + 1) / 8);
            column_count++;
        });
        grid_button.on('released', function() {
            column_count--;
            if (column_count == 0) turn_off_column(push, x);
            player(x + 60, 0);
        });
    });
}

//nicked

var log = console.log.bind(console),
    keyData,
    midi;
var AudioContext = AudioContext || webkitAudioContext; // for ios/safari
var context = new AudioContext();
var btnBox,
    btn;
var data, cmd, channel, type, note, velocity;

window.addEventListener('load', function() {
    btn = document.getElementsByClassName('button');
    for (var i = 0; i < btn.length; i++) {
        btn[i].addEventListener('mousedown', clickPlayOn);
        btn[i].addEventListener('mouseup', clickPlayOff);
    }

    // prepare audio files
    for (var i = 0; i < btn.length; i++) {
        addAudioProperties(btn[i]);
    }
});

var sampleMap = {
    key60: 1,
    key61: 2,
    key62: 3,
    key63: 4,
    key64: 5
};
// user interaction, mouse click
function clickPlayOn(e) {
    e.target.classList.add('active');
    e.target.play();
}

function clickPlayOff(e) {
    e.target.classList.remove('active');
}

function player(note, velocity, f) {
    var sample = sampleMap['key' + note];
    if (sample) {
        if (type == (0x80 & 0xf0) || velocity == 0) { //QuNexus always returns 144
            btn[sample - 1].classList.remove('active');
            return;
        }
        btn[sample - 1].classList.add('active');
        btn[sample - 1].play(velocity, f);
    }
}

// audio functions
function loadAudio(object, url) {
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
        context.decodeAudioData(request.response, function (buffer) {
            object.buffer = buffer;
        });
    }
    request.send();
}

function addAudioProperties(object) {
    console.log('adding audio props');
    object.name = object.id;
    object.source = object.dataset.sound;
    loadAudio(object, object.source);
    object.play = function (volume, f) {
        var freqFactor = (f !== undefined) ? f : 1;

        var s = context.createBufferSource();
        var f = context.createBiquadFilter();
        f.frequency.value = freqFactor * freqFactor * 12000; // TODO exponentially scaled
        var g = context.createGain();
        var v;
        s.buffer = object.buffer;
        s.playbackRate.value = randomRange(0.5, 2);
        if (volume) {
            v = rangeMap(volume, 1, 127, 0.2, 2);
            s.connect(f);
            f.connect(g);
            g.gain.value = v * v;
            g.connect(context.destination);
        } else {
            s.connect(context.destination);
        }

        s.start();
        object.s = s;
    }
}

// utility functions
function randomRange(min, max) {
    return Math.random() * (max + min) + min;
}

function rangeMap(x, a1, a2, b1, b2) {
    return ((x - a1) / (a2 - a1)) * (b2 - b1) + b1;
}

function frequencyFromNoteNumber(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}