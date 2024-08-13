var fs = require('fs');
var wstream = fs.createWriteStream('noise0.dat');
var farr = new Float32Array(16*16*16);

for(let i = 0; i < 16; i++) {
    for(let j = 0; j < 16; j++) {
        for(let k = 0; k < 16; k++) {
            farr[i*16*16+j*16+k] = Math.random() * 2 - 1;
        }
    }
}
var buffer = Buffer.alloc(farr.length*4);


for(var i = 0; i < farr.length; i++){
    //write the float in Little-Endian and move the offset
    buffer.writeFloatLE(farr[i], i*4);
}

wstream.write(buffer);
wstream.end();