'use strict'
const Push = require('./push.js')
const log = console.log
const zeroToSeven = [0, 1, 2, 3, 4, 5, 6, 7]
const oneToEight = [1, 2, 3, 4, 5, 6, 7, 8]

const listener = (elem, event, cb) => { elem.on(event, cb); return () => elem.removeListener(event, cb) }
const onPressed = elem => cb => listener(elem, 'pressed', cb)
const onReleased = elem => cb => listener(elem, 'released', cb)

module.exports = (midiOutCallBacks = []) => {
  let push = new Push({ send: bytes => { midiOutCallBacks.forEach(callback => callback(bytes)) }})
  let pads = oneToEight.map(x => oneToEight.map(y => {
    let pad = push.grid.x[x].y[y]
    return {
      ledOn: pad.led_on.bind(pad),
      ledOff: pad.led_off.bind(pad),
      ledRGB: pad.led_rgb.bind(pad),
      onPressed: onPressed(pad),
      onReleased: onReleased(pad)
    }
  }))

  return {
    gridRow: y => zeroToSeven.map(x => pads[x][y]),
    gridCol: x => zeroToSeven.map(y => pads[x][y]),
    midiIn: bytes => push.receive_midi(bytes)
  }
}
