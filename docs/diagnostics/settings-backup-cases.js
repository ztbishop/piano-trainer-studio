// Shared isolated cases for Node and the browser diagnostic. No native storage access.
function runSettingsBackupValidationChecks(api) {
    let count = 0;
    const check = (ok, label) => { if (!ok) throw new Error(label); count++; api.report?.(label); };
    const assignmentKey = 'pt_handAssignment_v1_' + 'a'.repeat(32);
    const assignment = {mode:'voice',staff:{1:'right',2:'left'},voice:{'["P1","1"]':'accompaniment'},playAccompaniment:false};
    const values = {
        pt_appearance:'soft-light',pt_playerPianoType:61,pt_savedMidiInName:'Old keyboard',pt_savedMidiOutName:'Piano',pt_savedMidiLightsName:'Lights',
        pt_savedMidiIn:'input-id',pt_savedMidiOut:'output-id',pt_savedMidiLights:'light-id',pt_wledIp:'piano.local',
        pt_ledOutputMode:'midi',pt_wledTransport:'http-json',pt_trainerMode:'follow',pt_wledTransportWarningAccepted:'1',
        pt_ledCount:100,pt_ledMasterBrightness:25,pt_ledFuture1Pct:0,pt_ledFuture2Pct:100,
        pt_trainerPianoVolume:80,pt_trainerMidiOutVolume:65,pt_metronomeVolume:25,pt_trainerMidiInBoost:100,pt_trainerZoom:105,
        pt_savedMidiInChannel:0,pt_savedMidiOutChannel:1,pt_savedMidiLightsChannel:16,pt_futurePreviewDepth:2,
        pt_ledCalibration:JSON.stringify({21:-40,108:40}),[assignmentKey]:JSON.stringify(assignment)
    };
    for (const key of api.keys) if (!(key in values)) values[key] = false;
    const validated = api.validate({version:1,settings:values});
    check(api.keys.every(key=>key in validated),'Every supported preference has a validation rule');
    check(validated.pt_feedbackEnabled==='false' && validated.pt_trainerZoom==='105','Legacy boolean/number primitives become storage strings');
    check(JSON.parse(validated[assignmentKey]).voice['["P1","1"]']==='accompaniment','Hand assignment identity and roles preserved');
    check(JSON.parse(validated.pt_ledCalibration)['21']===-40,'Calibration boundaries preserved');
    for (const payload of [values,{settings:values},{version:1,exportedAt:'old metadata',appVersion:'1.2.5',settings:values}]) {
        api.import(payload);
        check(api.get('pt_appearance')==='soft-light','Supported legacy/current format imports');
    }
    api.set('unrelated','keep');api.set('pt_starterLibraryImported_v1','true');
    const otherAssignment='pt_handAssignment_v1_'+'b'.repeat(32);api.set(otherAssignment,JSON.stringify({staff:{1:'left'}}));
    api.import({settings:{pt_appearance:'dark',unknownOldKey:{ignored:true},pt_trainerZoom:null}});
    check(api.get('unrelated')==='keep'&&api.get('pt_starterLibraryImported_v1')==='true'&&api.get(otherAssignment)!==null,'Unrelated, starter and absent assignment keys preserved');
    check(api.get('unknownOldKey')===null && api.get('pt_trainerZoom')===null,'Unknown keys ignored; legacy null/omitted globals keep replace semantics');
    api.import({version:1,settings:values});
    const backup=api.export();api.import(backup);
    check(JSON.stringify(api.export().settings)===JSON.stringify(backup.settings),'Export/import round trip preserves supported values');
    const bad = [null,[],4,{}, {version:2,settings:values},{version:'1',settings:values},{version:1,scores:[],folders:[]},
        {settings:null},{settings:[]},{settings:'bad'},{settings:{unknown:'x'}},
        {settings:{pt_appearance:'night'}},{settings:{pt_trainerMode:'fast'}},
        {settings:{pt_feedbackEnabled:'yes'}},{settings:{pt_feedbackEnabled:1}},
        {settings:{pt_trainerZoom:''}},{settings:{pt_trainerZoom:Infinity}},{settings:{pt_trainerZoom:49}},
        {settings:{pt_trainerPianoVolume:101}},{settings:{pt_trainerPianoVolume:2.5}},
        {settings:{pt_savedMidiOutChannel:0}},{settings:{pt_savedMidiInChannel:17}},
        {settings:{pt_savedMidiIn:{id:'bad'}}},{settings:{pt_ledCount:[]}},
        {settings:{pt_ledCalibration:'[]'}},{settings:{pt_ledCalibration:'{"21":41}'}},{settings:{pt_ledCalibration:'{"128":0}'}},
        {settings:{[assignmentKey]:'bad'}},{settings:{[assignmentKey]:'{}'}},
        {settings:{[assignmentKey]:JSON.stringify({mode:'invalid'})}},
        {settings:{[assignmentKey]:JSON.stringify({staff:{0:'right'}})}},
        {settings:{[assignmentKey]:JSON.stringify({voice:{bad:'right'}})}},
        {settings:{[assignmentKey]:JSON.stringify({staff:{1:'melody'}})}},
        {settings:{[assignmentKey]:JSON.stringify({playAccompaniment:'false'})}},
        {version:1,settings:{pt_appearance:'light',pt_trainerZoom:'invalid'}}];
    for(const payload of bad){
        const before=api.snapshot();let error;
        try{api.import(payload);}catch(e){error=e;}
        check(!!error && api.snapshot()===before,'Invalid backup rejected before any store mutation');
    }
    const before=api.localSnapshot();api.failOnce('pt_trainerZoom');let rejected=false;
    try{api.import({settings:{pt_appearance:'light',pt_trainerZoom:100}});}catch(_){rejected=true;}
    check(rejected && api.localSnapshot()===before,'Write failure rolls back earlier settings without touching scores');
    return count;
}
if(typeof module!=='undefined')module.exports=runSettingsBackupValidationChecks;
