'use strict'

const { timeDivisionButtonToCC, buttonToCC } = require('./src/buttonMap')
const zeroToSeven = [0, 1, 2, 3, 4, 5, 6, 7]
const lcdOffsets = [0, 9, 17, 26, 34, 43, 51, 60]
const combine = (...parts) => compose({}, ...parts)
const compose = (elem, ...parts) => Object.assign({}, ...parts.map(part => (typeof part === 'function') ? part(elem) : part))

const listenable = () => {
  let store = []
  return {
    dispatch: value => { store.forEach(listener => listener(value)) },
    listen: listener => {
      if (store.indexOf(listener) === -1) store.push(listener)
      return () => { store = store.filter(cb => cb !== listener) }
    }
  }
}
const aftertouchable = ({ aftertouch: { listen: onAftertouch } }) => ({ onAftertouch })
const pitchbendable = ({ bend: { listen: onPitchBend } }) => ({ onPitchBend })
const pressable = ({ press: { listen: onPressed } }) => ({ onPressed })
const releaseable = ({ release: { listen: onReleased } }) => ({ onReleased })
const turnable = ({ turn: { listen: onTurned } }) => ({ onTurned })

const rgbButton = (sendOnOff, sendRgbSysex) => ({
  ledOn: (value = 100) => sendOnOff(value),
  ledOff: () => sendOnOff(0),
  ledRGB: (r = 0, g = 0, b = 0) => sendRgbSysex(r, g, b)
})
const dimmableLed = send => ({
  ledOn: () => send(4),
  ledDim: () => send(1),
  ledOff: () => send(0)
})
const dimColours = { orange: 7, red: 1, green: 19, yellow: 13 }
const dimColour = colour => dimColours[colour] || dimColours['orange']
const roygLed = send => ({
  ledOn: (colour = 'orange') => send(dimColour(colour) + 3),
  ledDim: (colour = 'orange') => send(dimColour(colour)),
  ledOff: () => send(0)
})

function eigthCharLcdData (input) {
  let chars = input.split('').slice(0, 8).map(x => x.charCodeAt(0))
  while (chars.length < 8) chars.push(32)
  return chars
}

const lcdSegment = (send, x, y) => ({
  clear: () => send(x, y, ''),
  display: (text = '') => send(x, y, text)
})

function webMidiIO () {
  if (navigator && navigator.requestMIDIAccess) {
    return navigator.requestMIDIAccess({ sysex: true }).then(midiAccess => {
      const userPort = ports => ports.filter(port => port.name === 'Ableton Push User Port')[0] || undefined
      const input = userPort(Array.from(midiAccess.inputs.values()))
      const output = userPort(Array.from(midiAccess.outputs.values()))

      return (input && output)
        ? Promise.resolve({ inputPort: input, outputPort: output })
        : Promise.reject('No default MIDI IO ports found with name "Ableton Push User Port"')
    })
  }
  return Promise.reject('Web MIDI API not supported by this browser!')
}

module.exports = {
  webMIDIio: webMidiIO,
  push: () => {
    let midiOutCallBacks = []
    const midiOut = bytes => { midiOutCallBacks.forEach(callback => callback(bytes)) }
    const sendCC = cc => value => { midiOut([176, cc, value]) }
    const sendMidiNote = note => value => { midiOut([144, note, value]) }
    const sendSysex = data => { midiOut([240, 71, 127, 21, ...data, 247]) }
    const lcdSegmentSysex = (x, y, data) => sendSysex([27 - y, 0, 9, lcdOffsets[x], ...eigthCharLcdData(data)])
    const rgbSysex = index => (r, g, b) => {
      const msb = [r, g, b].map(x => (x & 240) >> 4)
      const lsb = [r, g, b].map(x => x & 15)
      sendSysex([4, 0, 8, index, 0, msb[0], lsb[0], msb[1], lsb[1], msb[2], lsb[2]])
    }

    const buttons = Object.keys(buttonToCC).map(name => ({ id: buttonToCC[name], name, press: listenable(), release: listenable() }))
    const channelSelectButtons = zeroToSeven.map(x => ({ id: 20 + x, press: listenable(), release: listenable() }))
    const gridSelectButtons = zeroToSeven.map(x => ({ id: 102 + x, press: listenable(), release: listenable() }))
    const timeDivisionButtons = Object.keys(timeDivisionButtonToCC).map(name => ({ id: timeDivisionButtonToCC[name], name, press: listenable(), release: listenable() }))

    const pads = zeroToSeven.map(x => zeroToSeven.map(y => ({ id: x + 8 * y + 36, press: listenable(), release: listenable(), aftertouch: listenable() })))

    const channelKnobs = zeroToSeven.map(x => ({ cc: 71 + x, note: x, press: listenable(), release: listenable(), turn: listenable() }))
    const masterKnob = { cc: 79, note: 8, press: listenable(), release: listenable(), turn: listenable() }
    const swingKnob = { cc: 15, note: 9, press: listenable(), release: listenable(), turn: listenable() }
    const tempoKnob = { cc: 14, note: 10, press: listenable(), release: listenable(), turn: listenable() }
    const knobApi = knob => compose(knob, pressable, releaseable, turnable)

    const touchstrip = { note: 12, press: listenable(), release: listenable(), bend: listenable() }

    const api = {
      buttons: buttons.reduce((acc, button) => {
        acc[button.name] = compose(button, pressable, releaseable, dimmableLed(sendCC(button.id)))
        return acc
      }, {}),
      pads: pads.map(col => col.map(pad => compose(pad, rgbButton(sendMidiNote(pad.id), rgbSysex(pad.id - 36)), aftertouchable, pressable, releaseable))),
      timeDivisionButtons: timeDivisionButtons.reduce((acc, button) => {
        acc[button.name] = compose(button, roygLed(sendCC(button.id)), pressable, releaseable)
        return acc
      }, {})
    }

    const dispatchers = {
      // MIDI NOTES
      144: combine(
        [].concat.apply([], pads).reduce((acc, pad) => {
          acc[pad.id] = velocity => velocity > 0 ? pad.press.dispatch(velocity) : pad.release.dispatch()
          return acc
        }, {}),
        [masterKnob, swingKnob, tempoKnob, ...channelKnobs].reduce((acc, knob) => {
          acc[knob.note] = value => value > 0 ? knob.press.dispatch() : knob.release.dispatch()
          return acc
        }, {}),
        {[touchstrip.note]: value => {
          if (value > 0) {
            touchstrip.press.dispatch()
          } else {
            touchstrip.release.dispatch()
            touchstrip.bend.dispatch(8192)
          }
        }}
      ),
      // POLY PRESSURE
      160: [].concat.apply([], pads).reduce((acc, pad) => {
        acc[pad.id] = pad.aftertouch.dispatch
        return acc
      }, {}),
      // MIDI CC
      176: combine(
        [...buttons, ...channelSelectButtons, ...gridSelectButtons, ...timeDivisionButtons]
          .reduce((acc, button) => {
            acc[button.id] = value => value > 0 ? button.press.dispatch() : button.release.dispatch()
            return acc
          }, {}),
        [masterKnob, swingKnob, tempoKnob, ...channelKnobs].reduce((acc, knob) => {
          acc[knob.cc] = value => knob.turn.dispatch(value < 64 ? value : value - 128)
          return acc
        }, {})
      )
    }

    const dispatchIncomingMidi = ([one, two, ...rest]) => {
      const messageType = one & 0xf0
      switch (messageType) {
        case (176): // CC
        case (144): // NOTE-ON
        case (128): // NOTE-OFF
        case (160): // POLY PRESSURE (AFTERTOUCH)
          dispatchers[messageType][two] && dispatchers[messageType][two](...rest)
          break
        case (224): // PITCHBEND
          const fourteenBitValue = (rest[0] << 7) + two
          if (fourteenBitValue !== 8192) touchstrip.bend.dispatch(fourteenBitValue)
          break
      }
    }

    return {
      button: name => api.buttons[name],
      channelKnobs: () => channelKnobs.map(knobApi),
      channelSelectButtons: () => channelSelectButtons.map(button => compose(button, roygLed(sendCC(button.id)), pressable, releaseable)),
      clearLCD: () => { [27, 26, 25, 24].forEach(row => { sendSysex([row, 0, 69, 0, ...new Array(68).fill(32)]) }) },
      gridRow: y => zeroToSeven.map(x => api.pads[x][y]),
      gridCol: x => api.pads[x].slice(),
      gridSelectButtons: () => gridSelectButtons.map(button => compose(button, rgbButton(sendCC(button.id), rgbSysex(button.id - 38)), pressable, releaseable)),
      lcdSegmentsCol: x => zeroToSeven.map(y => lcdSegment(lcdSegmentSysex, x, y)),
      lcdSegmentsRow: y => zeroToSeven.map(x => lcdSegment(lcdSegmentSysex, x, y)),
      midiFromHardware: dispatchIncomingMidi,
      onMidiToHardware: listener => { midiOutCallBacks.push(listener); return () => { midiOutCallBacks = midiOutCallBacks.filter(cb => cb !== listener) } },
      timeDivisionButtons: name => api.timeDivisionButtons[name],
      masterKnob: () => knobApi(masterKnob),
      swingKnob: () => knobApi(swingKnob),
      tempoKnob: () => knobApi(tempoKnob),
      touchstrip: () => compose(touchstrip, pressable, releaseable, pitchbendable)
    }
  }
}
