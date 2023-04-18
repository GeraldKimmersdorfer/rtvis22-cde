import './styles/styles.css';

import { CheckWebGPU } from './helper';
import * as ui from './ui'

import $ from "jquery";
import * as renderer from './renderer';
import { Database, fetchAndUnpackData } from './db';
import { error } from 'console';


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

$(function() {main()});
