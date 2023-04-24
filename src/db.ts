

import { formatMilliseconds, formatFileSize, formatUIntNumbers } from './helper';

import * as ui from './ui';

import * as renderer from './renderer';


export interface Database {
    datebounds: {
        db_first:Date,
        db_last:Date
    };
    temperaturebounds: {
        db_min_temp:number,
        db_max_temp:number
    };
    temperatures: {
        avgt:number
    }[];
    ctilbs: {
        first_month: number,
        id_temp_min: number
    }[];
    locations: {
        latitude: number,
        longitude: number,
        id_ctilb_min: number
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
        filename: "t15M_c498k_l40k_2b_9.lzma",
        temperatures: 404,
        locations: 404
    },    
    /*{
        name: "Original Cleaned",
        discretization: "2-bit",
        compressedsize: "404 MB",
        size: "404 MB",
        filename: "cdata_orig_clean_2bit_0.lzma",
        temperatures: 404,
        locations: 404
    },*/
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
    ui.hideLegend();
    ui.showLoadingDialog();
    fetchAndUnpackDatabase().then((db:Database) => {
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
    }).catch((error:string) => {
        ui.loadingDialogError(error);
    });
}

const fetchAndUnpackDatabase = async (): Promise<Database> => {
    var bufferTime = performance.now()

    /// Downloading data
    ui.loadingDialogLabel("Fetching dataset");
    bufferTime = performance.now();
    let url = getCurrentDatabaseUrl();
    let binData = await downloadData(url);
    ui.loadingDialogAddHistory(`Fetched dataset [${formatFileSize(binData.byteLength)}; ${formatMilliseconds(performance.now() - bufferTime)}]`);
    ui.loadingDialogProgress(-1);
    
    /// LZMA Decompression
    ui.loadingDialogLabel("LZMA decompression of data");
    bufferTime = performance.now();
    let decBinData = await decompressData(binData);
    ui.loadingDialogAddHistory(`LZMA Decompression [${formatFileSize(decBinData.byteLength)}; ${formatMilliseconds(performance.now() - bufferTime)}]`);
    
    /// Reading binary data
    ui.loadingDialogLabel("Reading of binary data");
    bufferTime = performance.now();
    let db:Database = await readData(decBinData);
    ui.loadingDialogAddHistory(`Read ${formatUIntNumbers(db.temperatures.length)} entries @ ${formatUIntNumbers(db.locations.length)} locations with ${formatUIntNumbers(db.ctilbs.length)} ctilbs [${formatMilliseconds(performance.now() - bufferTime)}]`);

    return db;
}

const downloadData = (url: string): Promise<Uint8Array> => {
    return new Promise<Uint8Array>(function(resolve, reject) {
        let oReq = new XMLHttpRequest();
        oReq.open("GET", url, true);
        oReq.responseType = "arraybuffer";
        oReq.onerror = function(error) {
            reject("Couldnt fetch database file: " + error);
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
                throw Error(`Error while fetching dataset: ${oReq.status} - ${oReq.statusText}`);
            } else {
                //Successfully fetched file:
                resolve(new Uint8Array(oReq.response));
            }
        };
        oReq.send();
    });
}

const decompressData = (data: Uint8Array) => {
    return new Promise<Uint8Array>(function(resolve, reject) {
        if (typeof(Worker) === "undefined") {
            reject("No web workers supported!");
        } else {
            const worker = new Worker("assets/scripts/db_decompress_worker.js");
            worker.onmessage = function(msg) {
                let res = msg.data;
                if (res instanceof Error) {
                    reject("LZMA decompression failed:" + res);
                } else if (res instanceof Uint8Array) {
                    resolve(res);
                } else {
                    reject("Unkown return type by Decompression worker");
                }
            }
            worker.postMessage(data.buffer);
        }
    });
}

const readData = (data: Uint8Array) => {
    return new Promise<Database>(function(resolve, reject) {
        if (typeof(Worker) === "undefined") {
            reject("No web workers supported!");
        } else {
            const worker = new Worker("assets/scripts/db_read_worker.js");
            worker.onmessage = function(msg) {
                let res = msg.data;
                if (res instanceof Error) {
                    reject("Reading Binary data failed. " + res);
                } else {
                    resolve(res);
                }
            }
            worker.postMessage(data.buffer);
        }
    });   
}