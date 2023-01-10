const lzma = require('../node_modules/lzma/src/lzma-d-min.js')
import { formatMilliseconds } from './helper';
import * as ui from './ui'

export interface Database {
    bounds_avgt: {
        min:number,
        max:number
    };
    bounds_date: {
        min:Date,
        max:Date
    };
    positions: {
        lat:number,
        lon:number,
        x:number,
        y:number,
        id_min:number,
        id_max:number
    }[];
    temperatures: {
        dm:number,
        avgt:number,
        src:number
    }[];
}

export var DB:Database;

let _bufferTime = 0.0;
let _successFunction: ((arg0:Database) => void);
let _failureFunction: ((arg0:string) => void);


export const fetchAndUnpackData = (on_finish:(data:Database)=>void, on_failure:(msg:string)=>void) => {
    _successFunction = on_finish;
    _failureFunction = on_failure;
    _bufferTime = performance.now();
    var oReq = new XMLHttpRequest();
    oReq.open("GET", "assets/cdata.lzma", true);
    oReq.responseType = "arraybuffer";
    ui.loadingDialogLabel("Fetching dataset")
    oReq.onerror = function() {
        _failureFunction("Critical Network Error: Couldnt fetch database file");
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
            _failureFunction(`Error while fetching dataset: ${oReq.status} - ${oReq.statusText}`);
        } else {
            //Successfully fetched file:
            let binInputData = new Uint8Array(oReq.response)
            let speed = formatMilliseconds(performance.now() - _bufferTime);
            ui.loadingDialogAddHistory(`Fetched dataset [${(binInputData.byteLength / (1024 * 1024)).toFixed(2)} MB; ${speed}]`);
            ui.loadingDialogProgress(-1);
            ui.loadingDialogLabel("LZMA decompression of data");
            decompressData(binInputData);
        }
    };
    oReq.send();
}


const decompressData = (data: Uint8Array) => {
    _bufferTime = performance.now();
    lzma.LZMA.decompress(data,
        function on_finish(res: Uint8Array, error: string) {
            if (!res) {
                _failureFunction("LZMA decompression failed with error message :" + error)
            } else {
                res = new Uint8Array(res);
                let speed = formatMilliseconds(performance.now() - _bufferTime);
                ui.loadingDialogAddHistory(`LZMA Decompression [${(res.byteLength / (1024 * 1024)).toFixed(2)} MB; ${speed}]`);
                unbinData(res.buffer);
            }
        });
}

const dvgetUintFcPtr:any = {
    1: DataView.prototype.getUint8,
    2: DataView.prototype.getUint16,
    4: DataView.prototype.getUint32
};

const unbinData = (data: ArrayBuffer) => {
    _bufferTime = performance.now();
    ui.loadingDialogProgress(0);
    ui.loadingDialogLabel("Unbinning of binary data");
    let dv = new DataView(data);

    let discretizeresolution = dv.getUint8(0);
    let bounds_date = {
        min: new Date(dv.getUint16(1, false), dv.getUint8(3), dv.getUint8(4)),
        max: new Date(dv.getUint16(5, false), dv.getUint8(7), dv.getUint8(8))
    };
    let bounds_avgt = {
        min: dv.getFloat32(9, false),
        max: dv.getFloat32(13, false)
    };

    let lenTemperatures = dv.getUint32(17);
    let lenPositions = dv.getUint16(21);
    let lenCountries = dv.getUint8(23);
    // Read position LUT
    let db = {
        'bounds_date': bounds_date,
        'bounds_avgt': bounds_avgt,
      'positions': new Array(lenPositions),
      'temperatures': new Array(lenTemperatures)
    };
    let offset = 24;
    for (let i = 0; i < lenPositions; i++) {
        db['positions'][i] = {
            'lat': dv.getFloat32(offset, false),
            'lon': dv.getFloat32(offset+4, false),
            'x': 0.0,
            'y': 0.0,
            'id_min': dv.getUint32(offset+8, false),
            'id_max': dv.getUint32(offset+12, false)
        };
        offset += 16;
    }
    // Read temperature db
    let avgtspan = bounds_avgt.max - bounds_avgt.min;
    let maxdisnumber = 2**(discretizeresolution*8)-1;
    let lastReportedProgress = -1;
    for (let i = 0; i < lenTemperatures; i++) {
        let packed_dm:number = dv.getUint16(offset);
        db['temperatures'][i] = {
            'dm': packed_dm >>> 2,
            'avgt': (dvgetUintFcPtr[discretizeresolution].bind(dv)(offset+2) * avgtspan / maxdisnumber) + bounds_avgt.min,
            'src': packed_dm & 3
        };
        offset += 2+discretizeresolution

        let currentProgress = Math.round(i / lenTemperatures * 100);
        if (currentProgress > lastReportedProgress) {
          lastReportedProgress = currentProgress;
          ui.loadingDialogProgress(lastReportedProgress);
        }
    }
    let speed = formatMilliseconds(performance.now() - _bufferTime);
    ui.loadingDialogAddHistory(`Read ${(db.temperatures.length/1000000).toFixed(2)}M entries @ ${db.positions.length} locations [${speed}]`);

    DB = db;
    _successFunction(DB);
}
