import { degrees_to_radians } from "./helper";
import { Vec2_f32 } from "./rendering/vectors";



class Equirectangular {
    
    R:number = 1.0;
    phi_1:number = 0.0;
    phi_0:number = 0.0;
    lambda_0:number = 0.0;

    project(lat:number, lng:number):Vec2_f32 {
        let lambda = lng;
        let phi = lat;
        //let lambda = (DB.positions[i]['lon'] + 180.0) / 360.0;
        //let phi = (DB.positions[i]['lat'] + 90.0) / 180.0;
        var point:Vec2_f32 = {
            x_f32 : ((lambda - this.lambda_0) * Math.cos(degrees_to_radians(this.phi_1)) + 180.0) / 360.0,
            y_f32 : ((phi - this.phi_0) + 90.0) / 180.0
        };
        point.x_f32 *= this.R;
        point.y_f32 *= this.R;
        return point;
    }
}

export class Robinson {

    mapWidth: number;
    mapHeight: number;
    fudgeX: number;
    fudgeY: number;
    earthRadius: number;
    AA:Array<number>;
    BB:Array<number>;

    constructor(mapWidth:number = 1.0, mapHeight:number = 1.97, fudgeX:number = 0.5, fudgeY:number = 0.5) {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.fudgeX = fudgeX;
        this.fudgeY = fudgeY;
        this.earthRadius = (mapWidth/2.666269758)/2;
        this.AA = [0.8487,0.84751182,0.84479598,0.840213,0.83359314,0.8257851,0.814752,0.80006949,0.78216192,0.76060494,0.73658673,0.7086645,0.67777182,0.64475739,0.60987582,0.57134484,0.52729731,0.48562614,0.45167814];
        this.BB = [0,0.0838426,0.1676852,0.2515278,0.3353704,0.419213,0.5030556,0.5868982,0.67182264,0.75336633,0.83518048,0.91537187,0.99339958,1.06872269,1.14066505,1.20841528,1.27035062,1.31998003,1.3523];
    }

    project(lat:number, lng:number):Vec2_f32 {
        var roundToNearest = function(roundTo:number, value:number):number {
            return Math.floor(value/roundTo)*roundTo;  //rounds down
        };
        var getSign = function(value:number):number {
            return value < 0 ? -1 : 1;
        };

        var lngSign = getSign(lng), latSign = getSign(lat); //deals with negatives
        lng = Math.abs(lng); lat = Math.abs(lat); //all calculations positive
        var radian = 0.017453293; //pi/180
        var low = roundToNearest(5, lat-0.0000000001); //want exact numbers to round down
        low = (lat == 0) ? 0 : low; //except when at 0
        var high = low + 5;
        
        // indicies used for interpolation
        var lowIndex = low/5;
        var highIndex = high/5;
        var ratio = (lat-low)/5;

        // interpolation in one dimension
        var adjAA = ((this.AA[highIndex]-this.AA[lowIndex])*ratio)+this.AA[lowIndex];
        var adjBB = ((this.BB[highIndex]-this.BB[lowIndex])*ratio)+this.BB[lowIndex];
            
        //create point from robinson function
        var point:Vec2_f32 = {
            x_f32 : (adjAA * lng * radian * lngSign * this.earthRadius) + this.fudgeX,
            y_f32 : (adjBB * latSign * this.earthRadius) * (this.mapHeight / this.mapWidth) + this.fudgeY
        };
        
        return point;

    }

}

var _projectionFunctions:any = {
    "Equirectangular": new Equirectangular(),
    "Robinson": new Robinson(),
}

var _currentProjection:any = _projectionFunctions['Equirectangular'];

export function setCurrentProjection(projName:string) {
    _currentProjection = _projectionFunctions[projName];
}

export function projectPoint(lat:number, lng:number):Vec2_f32 {
    return _currentProjection.project(lat, lng);
}