const LZMAJS = require("./lib/lzmajs.js").LZMAJS;

import { formatMilliseconds } from './helper';

import * as ui from './ui';

import * as renderer from './renderer';


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

const STARTUP_FILE_INDEX = 0
const DB_FILE_PATH = "assets/db/";
var _current_db_index = -1; // <-- startup index if not set as url param
export var DB_files = [
    {
        name: "Original (!Redundant entries)",
        discretization: "2-bit",
        compressedsize: "7.02 MB",
        size: "32.80 MB",
        filename: "cdata_orig_2bit_0.lzma",
        temperatures: 404,
        locations: 404
    },    
    {
        name: "Original Cleaned",
        discretization: "2-bit",
        compressedsize: "404 MB",
        size: "404 MB",
        filename: "cdata_orig_clean_2bit_0.lzma",
        temperatures: 404,
        locations: 404
    },
    {
        name: "Extended Interpolated",
        discretization: "2-bit",
        compressedsize: "18.60 MB",
        size: "40.20 MB",
        filename: "cdata_interp_2bit_0.lzma",
        temperatures: 404,
        locations: 404
    }
]

let _bufferTime = 0.0;
let _successFunction: ((arg0:Database) => void);
let _failureFunction: ((arg0:string) => void);

export const getCurrentDatabseId = ():number => {
    return _current_db_index;
}

const getCurrentDatabaseUrl = ():string => {
    if (_current_db_index < 0) {
        let db_filename = new URLSearchParams(window.location.search).get('db');
        if (db_filename) {
            DB_files.forEach((itm, ind) => {
                if (itm['filename'] == db_filename) setCurrentDatabaseById(_current_db_index = ind)
            });
            if (_current_db_index < 0) console.error(`Startup database with name '${db_filename}' does not exist.`);
        }
    }
    if (_current_db_index < 0) setCurrentDatabaseById(STARTUP_FILE_INDEX);
    return DB_FILE_PATH + DB_files[_current_db_index].filename;
}

export const setCurrentDatabaseById = (id:number) => {
    if (id < 0 || id >= DB_files.length) {
        console.error("DB-id outside bounds.");
        return;
    }
    _current_db_index = id;
    ui.loadedDatabaseChanged();
}

export const loadDatabaseById = (id:number) => {
    if (id < 0) {
        let db_filename = new URLSearchParams(window.location.search).get('db');
        if (db_filename) {
            DB_files.forEach((itm, ind) => {
                if (itm['filename'] == db_filename) setCurrentDatabaseById(_current_db_index = ind)
            });
            if (_current_db_index < 0) console.error(`Startup database with name '${db_filename}' does not exist.`);
        }
    } else {
        setCurrentDatabaseById(id);
    }
    ui.showLoadingDialog();
    fetchAndUnpackData(function on_success(db:Database) {
        ui.initWithData();
        renderer.init().then(() => {
            renderer.renderFrame(renderer.BufferFlags.NONE, renderer.RenderFlags.STAGE_AGGREGATE).then(() => {
                ui.loadingDialogSuccess("We're all set and ready");
                ui.showMainMenu();
                ui.showInfoMenu();
                ui.showCanvas();
                ui.showLegend();
            });
        }).catch(error => {
            ui.loadingDialogError(error);
        });
        
        var doitdelayed:number;
        window.addEventListener('resize', function(){
            this.clearTimeout(doitdelayed);
            doitdelayed = this.setTimeout(() => { renderer.renderFrame(renderer.BufferFlags.UPDATE_GRID_BUFFER, renderer.RenderFlags.STAGE_BINNING_MINMAX); }, 100);
        });
    }, function on_failure(msg:string) {
        ui.loadingDialogError(msg);
    });
}

export const fetchAndUnpackData = (on_finish:(data:Database)=>void, on_failure:(msg:string)=>void) => {
    _successFunction = on_finish;
    _failureFunction = on_failure;
    _bufferTime = performance.now();
    let url = getCurrentDatabaseUrl();
    var oReq = new XMLHttpRequest();
    oReq.open("GET", url, true);
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
    new Promise<Uint8Array>((resolve, reject) => {
        let outStream = new LZMAJS.oStream();
        try {
            LZMAJS.decode(data.buffer, outStream);
        } catch (error) {
            reject(error);
        }
        return resolve(outStream.toUint8Array())
    }).catch(error => {
        _failureFunction("LZMA decompression failed:" + error)
    })
    .then(res => {
        if (res instanceof Uint8Array) {
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
