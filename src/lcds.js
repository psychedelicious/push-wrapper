const foreach = require('lodash.foreach'),
    one_to_eight = [1, 2, 3, 4, 5, 6, 7, 8],
    one_to_four = [1, 2, 3, 4]
    zero_to_seven = [0, 1, 2, 3, 4, 5, 6, 7],
    blank = 32;

function LCDSegment(lcds, row) {
    this.lcds = lcds
    this.row = row;
    this.lcd_data = [blank, blank, blank, blank, blank, blank, blank, blank]
}

LCDSegment.prototype.update = function(text) {
    this.lcd_data = lcd_data(text);
    this.lcds.update_row(this.row);
}

function LCDs(midi_out) {
    this.midi_out = midi_out;
    this.x = {};
    this.y = {};
    foreach(one_to_eight, (x) => {
        this.x[x] = { y: {} };
        foreach(one_to_four, (y) => {
            this.x[x].y[y] = new LCDSegment(this, y);
        })
    });
    foreach(one_to_four, (y) => {
        this.y[y] = { x: {} };
        foreach(one_to_eight, (x) => {
            this.y[y].x[x] = this.x[x].y[y];
        })
    });
}

LCDs.prototype.update_row = function(row_number) {
    var display_data = [];
    foreach(one_to_eight, (channel) => {
        display_data = display_data.concat(this.x[channel].y[row_number].lcd_data);
        if (channel < 8) display_data.push(blank);
    });
    this.midi_out.send(
        [240, 71, 127, 21]
        .concat([28 - row_number])
        .concat([0, 69, 0])
        .concat(display_data)
        .concat([247])
    );
}

function lcd_data(text) {
    return zero_to_seven.map((index) => {
        return text.length > index ? text.charCodeAt(index) : 32;
    });
}
module.exports = LCDs;