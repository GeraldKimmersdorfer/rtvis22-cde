import { Database, DB } from "../db";

interface Vec4_f32 {
    x_f32: number,
    y_f32: number,
    z_f32: number,
    w_f32: number
}

interface Vec2_u32 {
    x_u32: number,
    y_u32: number
}

interface Vec3_u32 {
    x_u32: number,
    y_u32: number,
    z_u32: number
}

interface Vec4_u32 {
    x_u32: number,
    y_u32: number,
    z_u32: number,
    w_u32: number
}

export class UniformBuffer {

    gridProperties: {
        scale: number,
        vs: number,
        hs: number,
        border: number
    } = { scale: 0.01, vs: 0, hs: 0, border: 0.1};
    screenSize: Vec2_u32 = { x_u32: 256, y_u32: 0 };
    gridResolution: Vec2_u32 =  { x_u32: 0, y_u32: 0 };
    timeRangeBounds: Vec4_u32 = { x_u32: 2953, y_u32: 3084, z_u32: 3073, w_u32: 3238 };
    monthComparison_i32: number = -1;
    firstMonthIndex_i32: number = 11;
    gridAspect_u32: number = 1;

    colorMode_u32: number = 1;
    colorA: Vec4_f32 = { x_f32: 33.0/255.0, y_f32: 102.0/255.0, z_f32: 172.0/255.0, w_f32: 0.9 };
    colorB: Vec4_f32 = { x_f32: 1.0, y_f32: 1.0, z_f32: 1.0, w_f32: 0.5 };
    colorC: Vec4_f32 = { x_f32: 178.0/255.0, y_f32: 24.0/255.0, z_f32: 43.0/255.0, w_f32: 0.9 };
    colorNull: Vec4_f32 = { x_f32: 1.0, y_f32: 1.0, z_f32: 1.0, w_f32: 0.05 };

    hoverIndex_i32: number = 0;
    buffer3: Vec3_u32 = {x_u32:0,y_u32:0,z_u32:0};

    constructor() {
        this.set_gridscale(this.gridProperties.scale);
    }

    refresh_db_properties(db:Database) {
        this.firstMonthIndex_i32 = db.bounds_date.min.getMonth();
    }

    set_gridscale(scale: number) {
        this.gridProperties.scale = scale;
        this.recalculate_grid();
    }

    // refresh vertical and horizontal spacing aswell as grid resolution
    recalculate_grid() {
        this.gridProperties.hs = Math.sqrt(3) * this.gridProperties.scale;
        this.gridProperties.vs = 3.0 / 2.0 * this.gridProperties.scale;
        if (this.gridAspect_u32 == 1) {
            let aspect = this.screenSize.x_u32 / this.screenSize.y_u32;
            this.gridProperties.hs /= aspect;
        }
        this.gridResolution = {
            x_u32: Math.ceil(1.0 / this.gridProperties.hs) + 1,
            y_u32: Math.ceil(1.0 / this.gridProperties.vs) + 1
        };
    }

    determine_hover_cell(scrx: number, scry: number) {
        var x = scrx / this.screenSize.x_u32;
        var y = 1.0 - (scry / this.screenSize.y_u32);
        
        var r = Math.floor(y * (this.gridResolution.y_u32 - 1));
        var q = x * (this.gridResolution.x_u32 - 1);
        if (r % 2 == 1) {
            q += this.gridProperties.hs / 2.0
        }
        var q = Math.floor(q);
        
        this.hoverIndex_i32 = r * this.gridResolution.x_u32 + q;
    }

    set_screensize(width: number, height: number) {
        this.screenSize = {x_u32: width, y_u32: height};
        this.recalculate_grid();
    }

    set_respect_aspect(val: boolean) {
        this.gridAspect_u32 = val ? 1 : 0;
        this.recalculate_grid();
    }

    get_pointcount():number {
        return this.gridResolution.x_u32 * this.gridResolution.y_u32;
    }

    // Dark magic function...
    _write_to_buffer(el: any, dv:DataView | null = null, byteOffset:number = 0): number {
        for (const k in el) {
            const v = el[k];
            if (typeof(v) == "object") {
                byteOffset = this._write_to_buffer(v, dv, byteOffset);
            } else if (typeof(v) == "number") {
                let type = k.split("_")[1];
                if (type == null) type = "f32";
                if (type == "u32") {
                    if (dv != null) dv.setUint32(byteOffset, v, true);
                    byteOffset += 4;
                } else if (type == "i32") {
                    if (dv != null) dv.setInt32(byteOffset, v, true);
                    byteOffset += 4
                } else {
                    if (dv != null) dv.setFloat32(byteOffset, v, true);
                    byteOffset += 4;
                }
            }
        }
        return byteOffset;
    }

    get_buffer(): ArrayBuffer {
        let byteLength = this._write_to_buffer(this);
        const uniformArrayBuffer = new ArrayBuffer(byteLength);
        this._write_to_buffer(this, new DataView(uniformArrayBuffer));
        return uniformArrayBuffer;
    }



}