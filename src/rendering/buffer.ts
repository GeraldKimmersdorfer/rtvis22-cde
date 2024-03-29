const kd = require('../../node_modules/kd-tree-javascript/kdTree-min.js')

import { Database, DB } from "../db";
import { euclid_distance } from "../helper";
import { Vec2_u32, Vec4_u32, Vec4_f32, Vec3_u32, Vec2_f32 } from "./vectors";



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

    colorMode_u32: number = 3;
    colorA: Vec4_f32 = { x_f32: 33.0/255.0, y_f32: 102.0/255.0, z_f32: 172.0/255.0, w_f32: 0.9 };
    colorB: Vec4_f32 = { x_f32: 1.0, y_f32: 1.0, z_f32: 1.0, w_f32: 0.5 };
    colorC: Vec4_f32 = { x_f32: 178.0/255.0, y_f32: 24.0/255.0, z_f32: 43.0/255.0, w_f32: 0.9 };
    colorNull: Vec4_f32 = { x_f32: 1.0, y_f32: 1.0, z_f32: 1.0, w_f32: 0.05 };
    colorPoints: Vec4_f32 = { x_f32: 0/255, y_f32: 255/255, z_f32: 0/255, w_f32: 0.8 };

    sizePoints_f32: number = 0.003;
    hoverIndex_i32: number = 0;

    temperatureBounds: Vec2_f32 = {x_f32:0.0, y_f32:0.0};

    useKdTreeImplementation_u32: number = 1;
    
    buff3: Vec3_u32 = {x_u32:0, y_u32:0, z_u32:0};

    constructor() {
        this.set_gridscale(this.gridProperties.scale);
    }

    refresh_db_properties(db:Database) {
        this.firstMonthIndex_i32 = db.datebounds.db_first.getMonth();
        this.temperatureBounds = { x_f32: db.temperaturebounds.db_min_temp, y_f32: db.temperaturebounds.db_max_temp }
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

    // Note: This function is just an approximation that works on a unified grid (and not a hexagonal one)... But its good enough.
    determine_hover_cell(scrx: number, scry: number):{col:number, row:number, i:number, changed:boolean} {
        var x = scrx / this.screenSize.x_u32;
        var y = 1.0 - (scry / this.screenSize.y_u32);

        var row = Math.floor(y * (this.gridResolution.y_u32 - 1));
        var col = x * (this.gridResolution.x_u32 - 1);
        if (row % 2 == 1) {
            col += this.gridProperties.hs / 2.0
        }
        var col = Math.floor(col);

        var oldIndex = this.hoverIndex_i32;
        this.hoverIndex_i32 = row * this.gridResolution.x_u32 + col;
        return {col: col, row: row, i:this.hoverIndex_i32, changed:oldIndex!=this.hoverIndex_i32};
    }

    get_mPoint_from_coordinates(col:number, row:number):{x:number, y:number} {
        var mPointPos = {
            x: col * this.gridProperties.hs,
            y: row * this.gridProperties.vs
        }
        if (row % 2 == 1) {
            mPointPos.x += this.gridProperties.hs / 2;
        }
        mPointPos.y  = 1.0 - mPointPos.y;
        mPointPos.x *= this.screenSize.x_u32;
        mPointPos.y *= this.screenSize.y_u32;
        //mPointPos.x -= 3;
        //mPointPos.y += 4;
        return mPointPos;
    }

    get_tooltipPos_from_coordinates(col:number, row:number):{x:number, y:number} {
        let bPointPos = this.get_mPoint_from_coordinates(col, row);
        bPointPos.y += (this.gridProperties.vs / 2.0 * this.screenSize.y_u32);
        return bPointPos;
    }

    set_screensize(width: number, height: number) {
        this.screenSize = {x_u32: width, y_u32: height};
        this.recalculate_grid();
    }

    set_respect_aspect(val: boolean) {
        this.gridAspect_u32 = val ? 1 : 0;
        this.recalculate_grid();
    }

    set_usekdtree(val: boolean) {
        this.useKdTreeImplementation_u32 = val ? 1 : 0;
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

interface GridEntry {
    mPoint: {x:number, y:number},
    value: number,
    valueN: number
}

export class GridBuffer {

    data:GridEntry[] = [];

    constructor() {
    }

    from_buffer(buff:ArrayBuffer) {
        const dvGridReadBuffer:DataView = new DataView(buff);
        this.data = [];
        for (var i = 0; i < buff.byteLength / 4 / 4; i++) {
            this.data.push({
                mPoint: {
                    x: dvGridReadBuffer.getFloat32(i*16, true),
                    y: dvGridReadBuffer.getFloat32(i*16+4, true)
                },
                value: dvGridReadBuffer.getFloat32(i*16+8, true),
                valueN: dvGridReadBuffer.getUint32(i*16+12, true)
            });
        }
    }

    get_stats():{max:number, min:number, avg:number, n_total:number, g_filled:number, g_empty:number} {
        var ret = {max: -1000, min: 1000, avg: 0, n_total: 0, g_filled: 0, g_empty: 0 };
        for (var i = 0; i < this.data.length; i++) {
            if (this.data[i].valueN > 0) {
                let val = this.data[i].value;
                if (val > ret.max) ret.max = val;
                if (val < ret.min) ret.min = val;
                ret.avg += val;
                ret.n_total += this.data[i].valueN;
                ret.g_filled += 1;
            }
        }
        ret.g_empty = this.data.length - ret.g_filled;
        ret.avg /= ret.g_filled;
        return ret;
    }

}

interface KdPositionEntry {
    x: number,
    y: number,
    left: number,
    right: number,
    
    id: number
}

export class KdPositionBuffer {

    data:KdPositionEntry[] = [];

    _append_kd_node_to_list(lst:KdPositionEntry[], node:any):number {
        if (node !== undefined &&  node !== null) {
            lst.push({
                x: node.obj.x,
                y: node.obj.y,
                left: -1,
                right: -1,
                id: node.obj.id,
            })
            let ci = lst.length - 1;
            lst[ci].left = this._append_kd_node_to_list(lst, node.left);
            lst[ci].right = this._append_kd_node_to_list(lst, node.right);
            return ci;
        } else {
            return -1;
        }
    }

    from_data(db:Database) {
        let pos_modified:any = db.locations;
        for (var i = 0; i < pos_modified.length; i++) {
            pos_modified[i]['id'] = i;
        }
        var tree = new kd.kdTree(pos_modified, euclid_distance, ["x", "y"]);
        var tdata:KdPositionEntry[] = [];
        this._append_kd_node_to_list(tdata, tree.root);
        this.data = tdata;
    }

    get_size(): number {
        return 6*4*this.data.length; // 2xfloat + 4xuint32 per entry
    }

    get_buffer(): ArrayBuffer {
        const arrayBuffer = new ArrayBuffer(this.get_size()); 
        const datView = new DataView(arrayBuffer);
        for (let i = 0; i < this.data.length; i++) {
            let itm = this.data[i];
            datView.setFloat32(i * 24, itm['x'], true);
            datView.setFloat32(i * 24 + 4, itm['y'], true);
            datView.setInt32(i * 24 + 8, itm['left'], true);
            datView.setInt32(i * 24 + 12, itm['right'], true);
            datView.setUint32(i * 24 + 16, itm['id'], true);
        }
        return arrayBuffer;
    }

}
