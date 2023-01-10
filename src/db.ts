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

const DISCRETIZE_TEMPERATURE_RESOLUTION = 2;


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

const unbinData = (data: ArrayBuffer) => {
    _bufferTime = performance.now();
    ui.loadingDialogProgress(0);
    ui.loadingDialogLabel("Unbinning of binary data");
    let dv = new DataView(data);
    let bounds_date = {
        min: new Date(dv.getUint16(0, false), dv.getUint8(2), dv.getUint8(3)),
        max: new Date(dv.getUint16(4, false), dv.getUint8(6), dv.getUint8(7))
    };
    let bounds_avgt = {
        min: dv.getFloat32(8, false),
        max: dv.getFloat32(12, false)
    };

    let lenTemperatures = dv.getUint32(16);
    let lenPositions = dv.getUint16(20);
    let lenCountries = dv.getUint8(22);
    // Read position LUT
    let db = {
        'bounds_date': bounds_date,
        'bounds_avgt': bounds_avgt,
      'positions': new Array(lenPositions),
      'temperatures': new Array(lenTemperatures)
    };
    let offset = 23;
    for (let i = 0; i < lenPositions; i++) {
        db['positions'][i] = {
            // TODO: (Note) lat and long is switched!!!
            'lat': dv.getFloat32(offset+4, false),
            'lon': dv.getFloat32(offset, false),
            'x': 0.0,
            'y': 0.0,
            'id_min': 0,
            'id_max': 0
        };
        offset += 8
    }
    // Read temperature db
    let avgtspan = bounds_avgt.max - bounds_avgt.min;
    let maxdisnumber = 2**(DISCRETIZE_TEMPERATURE_RESOLUTION*8)-1;
    let lastReportedProgress = -1;
    for (let i = 0; i < lenTemperatures; i++) {
        db['temperatures'][i] = {
            'dm': dv.getUint16(offset),
            'pid': dv.getUint16(offset+2),
            //'avgtdis': dv.getUint16(offset+4),
            'avgt': (dv.getUint16(offset+4) * avgtspan / maxdisnumber) + bounds_avgt.min,
            'src': dv.getUint8(offset+4+DISCRETIZE_TEMPERATURE_RESOLUTION)
        };
        offset += 5+DISCRETIZE_TEMPERATURE_RESOLUTION

        let currentProgress = Math.round(i / lenTemperatures * 100);
        if (currentProgress > lastReportedProgress) {
          lastReportedProgress = currentProgress;
          ui.loadingDialogProgress(lastReportedProgress);
        }
    }
    let speed = formatMilliseconds(performance.now() - _bufferTime);
    ui.loadingDialogAddHistory(`Read ${(db.temperatures.length/1000000).toFixed(2)}M entries @ ${db.positions.length} locations [${speed}]`);
    
    // ToDo: Already change database file layout into the following:
    // temperaturelist is sorted by pid! (and secondly by dm)
    // pid then can be removed from temperaturelist, but 
    // positionlist: every entry gets minIndex and maxIndex as int property!
    db.temperatures = db.temperatures.sort((a,b) => { return a['pid'] < b['pid'] ? -1 : 1; });
    db.positions[db.temperatures[0].pid]['id_min'] = 0;
    for (var i = 1; i < db.temperatures.length; i++) {
        if (db.temperatures[i-1].pid != db.temperatures[i].pid) {
            db.positions[db.temperatures[i-1].pid]['id_max'] = i-1;
            db.positions[db.temperatures[i].pid]['id_min'] = i;
        }

    }
    db.positions[db.temperatures[i-1].pid]['id_max'] = i-1

    DB = db;
    _successFunction(DB);
}
