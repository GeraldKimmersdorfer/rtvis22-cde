import './styles/styles.css';

import { CheckWebGPU } from './helper';
import * as ui from './ui'

import $ from "jquery";
import * as renderer from './renderer';
import { Database, fetchAndUnpackData } from './db';


// Entry-Point of Application
const main = () => {
    // Check whether WebGPU is available
    const gpuAvailable = CheckWebGPU();
    if(!gpuAvailable){
        ui.ShowNoWebGpuWarning();
        throw('Your current browser does not support WebGPU!');
    }

    // Initialize jQuery UI components, and show interface:
    ui.InitUserInterface();
    ui.showFooter();

    ui.loadingDialogProgress(0.5);
    fetchAndUnpackData(function on_success(db:Database) {
        //console.log(db);
        ui.initWithData();
        renderer.init().then(() => {
            renderer.renderFrame().then(() => {
                ui.loadingDialogSuccess("We're all set and ready");
                ui.showMainMenu();
                ui.showCanvas();
            });
        });
        
        var doitdelayed:number;
        window.addEventListener('resize', function(){
            this.clearTimeout(doitdelayed);
            doitdelayed = this.setTimeout(() => { renderer.renderFrame(true); }, 100);
        });
    }, function on_failure(msg:string) {
        ui.loadingDialogError(msg);
    });

}

$(function() {main()});
