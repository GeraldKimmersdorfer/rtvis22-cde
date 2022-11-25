const lzma = require('../node_modules/lzma/src/lzma-d-min.js')
import { formatMilliseconds } from './helper';
import * as ui from './ui'

let bufferTime = 0.0;
let successFunction: ((arg0:any) => void);
let failureFunction: ((arg0:string) => void);

const DISCRETIZE_TEMPERATURE_RESOLUTION = 1;

const decompressData = (data: Uint8Array) => {
    bufferTime = performance.now();
    lzma.LZMA.decompress(data, 
        function on_finish(res: Uint8Array, error: string) {
            if (!res) {
                failureFunction("LZMA decompression failed with error message :" + error)
            } else {
                res = new Uint8Array(res);
                let speed = formatMilliseconds(performance.now() - bufferTime);
                ui.loadingDialogAddHistory(`LZMA Decompression [${(res.byteLength / (1024 * 1024)).toFixed(2)} MB; ${speed}]`);
                unbinData(res.buffer);
            }
        });
}
// NOTE: CHECK WHETER dMONTHS is enough 
const unbinData = (data: ArrayBuffer) => {
    bufferTime = performance.now();
    ui.loadingDialogProgress(0);
    ui.loadingDialogLabel("Unbinning of binary data");
    let dv = new DataView(data);
    let boundsdate = [
        new Date(dv.getUint16(0, false), dv.getUint8(2), dv.getUint8(3)),
        new Date(dv.getUint16(4, false), dv.getUint8(6), dv.getUint8(7))
    ];
    let boundsavgt = [ dv.getFloat32(8, false), dv.getFloat32(12, false) ];
    
    let lenTemperatures = dv.getUint32(16);
    let lenPositions = dv.getUint16(20);
    let lenCountries = dv.getUint8(22);
    // Read position LUT
    let db = {
        'boundsdate': boundsdate,
        'boundsavgt': boundsavgt,
      'positions': new Array(lenPositions),
      'temperatures': new Array(lenTemperatures)
    };
    let offset = 23;
    for (let i = 0; i < lenPositions; i++) {
        db['positions'][i] = {
            'x': dv.getFloat32(offset, false),
            'y': dv.getFloat32(offset+4, false)
        };
        offset += 8
    }                                                                                                                                 
    // Read temperature db
    let avgtspan = boundsavgt[1] - boundsavgt[0];
    let maxdisnumber = 2**(DISCRETIZE_TEMPERATURE_RESOLUTION*8)-1;
    let lastReportedProgress = -1;
    for (let i = 0; i < lenTemperatures; i++) {
        db['temperatures'][i] = {
            'dd': dv.getUint32(offset),
            'pid': dv.getUint16(offset+4),
            'avgtdis': dv.getUint8(offset+6),
            'avgt': (dv.getUint8(offset+6) * avgtspan / maxdisnumber) + boundsavgt[0],
            'src': dv.getUint8(offset+6+DISCRETIZE_TEMPERATURE_RESOLUTION)
        };
        offset += 7+DISCRETIZE_TEMPERATURE_RESOLUTION
        
        let currentProgress = Math.round(i / lenTemperatures * 100);
        if (currentProgress > lastReportedProgress) {
          lastReportedProgress = currentProgress;
          ui.loadingDialogProgress(lastReportedProgress);
        }
    }
    let speed = formatMilliseconds(performance.now() - bufferTime);
    ui.loadingDialogAddHistory(`Read ${(db.temperatures.length/1000000).toFixed(2)}M entries @ ${db.positions.length} locations [${speed}]`);
    successFunction(db);
}

export const fetchAndUnpackData = (on_finish:(data:any)=>void, on_failure:(msg:string)=>void) => {
    successFunction = on_finish;
    failureFunction = on_failure;
    bufferTime = performance.now();
    var oReq = new XMLHttpRequest();
    oReq.open("GET", "cdata.lzma", true);
    oReq.responseType = "arraybuffer";
    ui.loadingDialogLabel("Fetching dataset")
    oReq.onerror = function() {
        failureFunction("Critical Network Error: Couldnt fetch database file");
    }
    oReq.onprogress = function(event) {
        if (event.lengthComputable) {
            ui.loadingDialogProgress(event.loaded / event.total);
          } else {
            ui.loadingDialogLabel(`Fetching dataset [${event.loaded} bytes]`);
          }
    }
    oReq.onload = function (oEvent) {
        if (oReq.status != 200) {
            failureFunction(`Error while fetching dataset: ${oReq.status} - ${oReq.statusText}`);
        } else {
            //Successfully fetched file:
            let binInputData = new Uint8Array(oReq.response)
            let speed = formatMilliseconds(performance.now() - bufferTime);
            ui.loadingDialogAddHistory(`Fetched dataset [${(binInputData.byteLength / (1024 * 1024)).toFixed(2)} MB; ${speed}]`);
            ui.loadingDialogProgress(-1);
            ui.loadingDialogLabel("LZMA decompression of data");
            decompressData(binInputData);
        }
    };
    oReq.send();
}