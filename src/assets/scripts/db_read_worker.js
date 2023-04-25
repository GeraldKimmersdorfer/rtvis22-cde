function binStreamReader(buffer) {
    dv = new DataView(buffer);
    cursor = 0;
    
    this.readUint = (byteSize, littleEndian) => {
        switch (byteSize) {
            case 1:
                return this.readUint8(littleEndian);
            case 2:
                return this.readUint16(littleEndian);
            case 3:
                return this.readUint24(littleEndian);
            case 4:
                return this.readUint32(littleEndian);
        }
        throw Error(`Unsupported byteSize of ${bytesize}`);
    }

    this.readUint8 = () => {
        tmp = dv.getUint8(cursor);
        cursor += 1;
        return tmp;
    }

    this.readUint16 = (littleEndian) => {
        tmp = dv.getUint16(cursor, littleEndian);
        cursor += 2;
        return tmp;
    }

    this.readUint24 = (littleEndian) => {
        if (littleEndian) {
            tmp = (dv.getUint8(cursor + 2) << 16) | (dv.getUint8(cursor + 1) << 8) | (dv.getUint8(cursor)); // little endian!
        } else {
            tmp = (dv.getUint8(cursor) << 16) | (dv.getUint8(cursor + 1) << 8) | (dv.getUint8(cursor + 2)); // big endian!
        }
        cursor += 3;
        return tmp;
    }

    this.readUint32 = (littleEndian) => {
        tmp = dv.getUint32(cursor, littleEndian);
        cursor += 4;
        return tmp;
    }

    this.readAsciiString = (length) => {
        tmp = ""
        for (var i = 0; i < length; i++) {
            tmp += String.fromCharCode(dv.getUint8(cursor + i));
        }
        cursor += length;
        return tmp;
    }

    this.readFloat32 = () => {
        tmp = dv.getFloat32(cursor, false);
        cursor += 4;
        return tmp;
    }
}

const undiscretize = (disval, valmin, valmax, omax) => {
    return (disval / omax) * (valmax - valmin) + valmin;
}

/*
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
}*/

const unbinData = (buffer) => {
    let br = new binStreamReader(buffer);

    // FILE IDENTIFICATION
    let fileidentification = br.readAsciiString(3);
    let fileversion = br.readUint(1);
    if (fileidentification != "CCE") throw Error(`Unknown File Identification (${fileidentification})`)
    if (fileversion != 3) throw Error("Unsupported File-Version")

    // HEADER
    let count_temperatures = br.readUint(4);
    let count_locations = br.readUint(4);
    let count_ctilb = br.readUint(4);
    let datebounds = {
        db_first: new Date(br.readUint(2), br.readUint(1), 1),
        db_last: new Date(br.readUint(2), br.readUint(1), 1)
    };
    let temperaturebounds = {
        db_min_temp: br.readFloat32(),
        db_max_temp: br.readFloat32()
    };
    let bc_temperature = br.readUint(1);
    let bc_temperatureindex = br.readUint(1);
    let bc_monthdifference = br.readUint(1);
    let bc_ctilbindex = br.readUint(1);

    let db = {
        'datebounds': datebounds,
        'temperaturebounds': temperaturebounds,
        'temperatures': new Array(count_temperatures),
        'ctilbs': new Array(count_ctilb),
        'locations': new Array(count_locations)
    };

    // TEMPERATURES
    let omax = 2**bc_temperature - 1;
    for (let i = 0; i < count_temperatures; i++) {
        let disValue = br.readUint(bc_temperature);
        db['temperatures'][i] = undiscretize(disValue, temperaturebounds.db_min_temp, temperaturebounds.db_max_temp, omax);
    }

    // CTILBS
    for (let i = 0; i < count_ctilb; i++) {
        db['ctilbs'][i] = {
            first_month: br.readUint(bc_monthdifference),
            id_temp_min: br.readUint(bc_temperatureindex),
        };
    }

    // LOCATIONS
    for (let i = 0; i < count_locations; i++) {
        db['locations'][i] = {
            latitude: br.readFloat32(),
            longitude: br.readFloat32(),
            id_ctilb_min: br.readUint(bc_ctilbindex)
        };
    }
    return db;
}

self.onmessage = function(msg){ // Using onmessage to receive the message in the worker.js 
    try {
        self.postMessage(unbinData(msg.data));
    } catch (error) {
        self.postMessage(error);
    }
} 