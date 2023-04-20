import './styles/styles.css';

import { CheckWebGPU } from './helper';
import * as ui from './ui'

import $ from "jquery";

import * as db from './db';
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

    db.loadDatabaseById(-1);

}

$(function() {main()});
