"use strict";

/* ---------------- CEA number parsing ---------------- */
// CEA prints floats as mantissa + optional exponent. The exponent is either
// a separate "digit" token (e.g. "1.1357 1" -> 11.357) or glued on when
// negative (e.g. "9.4144-1" -> 0.94144). "NaN" is also emitted as a column
// placeholder and must be captured to keep column alignment.
var CEA_NUM_RE = /NaN|-?\d+\.\d+(?:-\d|\s\d(?=\s|$))?/g;

function parseNumToken(tok){
  if(tok === "NaN") return NaN;
  var m = tok.match(/-?\d+\.\d+/);
  if(!m) return NaN;
  var mant = parseFloat(m[0]);
  var exp = tok.slice(m[0].length).trim();
  var e = 0;
  if(exp !== ""){
    e = parseInt(exp.replace(/\s+/g, ""), 10);
    if(isNaN(e)) e = 0;
  }
  return mant * Math.pow(10, e);
}

function extractNumbers(line){
  CEA_NUM_RE.lastIndex = 0;
  var nums = [];
  var firstIdx = -1;
  var m;
  while((m = CEA_NUM_RE.exec(line)) !== null){
    if(firstIdx < 0) firstIdx = m.index;
    nums.push(parseNumToken(m[0]));
  }
  return { label: firstIdx >= 0 ? line.slice(0, firstIdx).trim() : "", nums: nums };
}

var PROP_ALIASES = {
  "Pinf/P": "PinfP",
  "P, BAR": "P",
  "T, K": "T",
  "RHO, KG/CU M": "RHO",
  "H, KJ/KG": "H",
  "U, KJ/KG": "U",
  "G, KJ/KG": "G",
  "S, KJ/(KG)(K)": "S",
  "M, (1/n)": "M",
  "MW, MOL WT": "MW",
  "(dLV/dLP)t": "dLVdLPt",
  "(dLV/dLT)p": "dLVdLTp",
  "Cp, KJ/(KG)(K)": "Cp",
  "GAMMAs": "GAMMA",
  "SON VEL,M/SEC": "SONVEL",
  "MACH NUMBER": "MACH"
};

var PERF_ALIASES = {
  "Ae/At": "AeAt",
  "CSTAR, M/SEC": "CSTAR",
  "CF": "CF",
  "Ivac, M/SEC": "Ivac",
  "Isp, M/SEC": "Isp"
};

function newExit(){
  return {
    pinfP: null, aeAt: null, props: {}, perf: {}, massfrac: {},
    transport: { viscosity: null, equil: {}, frozen: {} }
  };
}

// Map performance-parameter columns onto the current block's exit list.
// CEARUN's pressure-ratio block prints one fewer perf column than it has
// exits (the last-but-one exit is dropped and the trailing supersonic
// area-ratio exit takes its place). We recover that here.
function perfExitIndex(nExit, perfLen, i){
  if(perfLen === nExit) return i;
  if(perfLen === nExit - 1) return (i === perfLen - 1) ? nExit - 1 : i;
  return i;
}

/* ---------------- CEA output parser ---------------- */
// Supports two layouts:
//  1. Standard NASA CEA `output.txt` (2-column CHAMBER/THROAT, single-value
//     PERFORMANCE PARAMETERS).
//  2. CEARUN "rocket" output with multiple EXIT columns per case. The same
//     (Pin, O/F) appears in several consecutive blocks (pressure-ratio exits,
//     subsonic area-ratio exits, supersonic area-ratio exits); those exits are
//     accumulated into case.exits[].
function parseCEA(text){
  var lines = text.split(/\r?\n/);
  var cases = [];
  var meta = {
    fuels: [], oxidizers: [], problemType: null, assumption: null,
    compType: "mass", options: [], hasTransport: false, hasExits: false
  };

  var caseMap = new Map();   // key "pin|of" -> case
  var inHeader = true;       // before the first "Pin =" line
  var pendingPin = null;
  var cur = null;            // current case (per pin/of)
  var mode = "none";         // none | props | perf | massfrac | transport
  var submode = null;        // equil | frozen (within transport)

  // per-block state (a block is one set of EXIT columns for a case)
  var nExit = 0;             // exit count for the current block
  var exitStart = 0;         // index in cur.exits where this block's exits begin
  var perfHasThroat = false; // whether the perf table has a throat slot

  for(var i = 0; i < lines.length; i++){
    var line = lines[i];

    // assumption (equilibrium / frozen)
    if(!meta.assumption && /ASSUMING\s+(EQUILIBRIUM|FROZEN)/i.test(line)){
      meta.assumption = /FROZEN/i.test(line) ? "Frozen" : "Equilibrium";
    }

    // meta only from the file header (before the first case)
    if(inHeader){
      var mm = line.match(/Problem Type:\s*"?([A-Za-z ]+)"?/i);
      if(mm) meta.problemType = mm[1].trim();
      mm = line.match(/^\s*fuel\s+(\S+)/i);
      if(mm) meta.fuels.push(mm[1]);
      mm = line.match(/^\s*oxid\s+(\S+)/i);
      if(mm) meta.oxidizers.push(mm[1]);
      mm = line.match(/^\s*output\s+(\S+)/i);
      if(mm) meta.options.push(mm[1]);
    }

    /* ---- case / block boundaries ---- */
    var m = line.match(/Pin\s*=\s*([\d.]+)\s*PSIA/i);
    if(m){
      inHeader = false;
      pendingPin = parseFloat(m[1]);
      cur = null;
      mode = "none";
      nExit = 0;
      continue;
    }

    m = line.match(/O\/F\s*=\s*([\d.]+)/);
    if(m && pendingPin !== null){
      var of = parseFloat(m[1]);
      var f = line.match(/%FUEL\s*=\s*([\d.]+)/);
      var key = pendingPin + "|" + of;
      cur = caseMap.get(key);
      if(!cur){
        cur = {
          pin: pendingPin, of: of,
          pctFuel: f ? parseFloat(f[1]) : undefined,
          chamber: {}, throat: {}, perf: {},
          massfrac: {}, transport: null, exits: []
        };
        caseMap.set(key, cur);
        cases.push(cur);
      }
      // start a new block of exits for this case
      exitStart = cur.exits.length;
      nExit = 0;
      perfHasThroat = false;
      mode = "none";
      continue;
    }

    if(!cur) continue;

    /* ---- section headers ---- */
    if(/CHAMBER\s+THROAT/.test(line)){ mode = "props"; continue; }
    if(/TRANSPORT\s+PROPERTIES/.test(line)){
      mode = "transport"; submode = null;
      meta.hasTransport = true;
      if(!cur.transport) cur.transport = { viscosity: null, equil: {}, frozen: {} };
      continue;
    }
    if(/PERFORMANCE\s+PARAMETERS/.test(line)){ mode = "perf"; continue; }
    if(/MASS\s+FRACTIONS/.test(line)){ meta.compType = "mass"; mode = "massfrac"; continue; }
    if(/MOLE\s+FRACTIONS/.test(line)){ meta.compType = "mole"; mode = "massfrac"; continue; }

    /* ---------------- properties table ---------------- */
    if(mode === "props"){
      var r = extractNumbers(line);
      if(r.nums.length >= 2 && r.label){
        if(r.label === "Pinf/P"){
          nExit = r.nums.length - 2;
          if(nExit > 0) meta.hasExits = true;
          cur.chamber.PinfP = r.nums[0];
          cur.throat.PinfP = r.nums[1];
          for(var e = 0; e < nExit; e++){
            var ex = newExit();
            ex.pinfP = r.nums[2 + e];
            cur.exits.push(ex);
          }
        } else {
          var key = PROP_ALIASES[r.label] || r.label;
          cur.chamber[key] = r.nums[0];
          cur.throat[key] = r.nums[1];
          for(var e2 = 0; e2 < nExit; e2++){
            var ex2 = cur.exits[exitStart + e2];
            if(ex2) ex2.props[key] = r.nums[2 + e2];
          }
        }
      }
    }
    /* ---------------- performance parameters ---------------- */
    else if(mode === "perf"){
      var r2 = extractNumbers(line);
      if(r2.nums.length >= 1 && r2.label){
        var k2 = PERF_ALIASES[r2.label] || r2.label;
        if(k2 === "AeAt"){
          perfHasThroat = (r2.nums.length >= 2 && isNaN(r2.nums[1]));
        }
        cur.perf[k2] = r2.nums[0];
        var perfStart = perfHasThroat ? 2 : 1;
        var perfVals = r2.nums.slice(perfStart);
        for(var pe = 0; pe < perfVals.length; pe++){
          var idx = perfExitIndex(nExit, perfVals.length, pe);
          var ex3 = cur.exits[exitStart + idx];
          if(ex3){
            ex3.perf[k2] = perfVals[pe];
            if(k2 === "AeAt") ex3.aeAt = perfVals[pe];
          }
        }
      }
    }
    /* ---------------- composition ---------------- */
    else if(mode === "massfrac"){
      var r3 = extractNumbers(line);
      if(r3.nums.length >= 2 && r3.label && !/THERMODYNAMIC|NOTE/i.test(r3.label)){
        cur.massfrac[r3.label] = [r3.nums[0], r3.nums[1]];
        for(var mf = 0; mf < nExit; mf++){
          var ex4 = cur.exits[exitStart + mf];
          if(ex4) ex4.massfrac[r3.label] = r3.nums[2 + mf];
        }
      }
    }
    /* ---------------- transport properties ---------------- */
    else if(mode === "transport"){
      if(/WITH\s+EQUILIBRIUM\s+REACTIONS/.test(line)){ submode = "equil"; continue; }
      if(/WITH\s+FROZEN\s+REACTIONS/.test(line)){ submode = "frozen"; continue; }
      var r4 = extractNumbers(line);
      if(r4.nums.length >= 2 && r4.label){
        if(/VISC/.test(r4.label)){
          cur.transport.viscosity = [r4.nums[0], r4.nums[1]];
          for(var v = 0; v < nExit; v++){
            var ex5 = cur.exits[exitStart + v];
            if(ex5) ex5.transport.viscosity = r4.nums[2 + v];
          }
        } else if(submode){
          var tkey = /CONDUCTIVITY/.test(r4.label) ? "cond"
                   : /PRANDTL/.test(r4.label) ? "prandtl"
                   : /^Cp/.test(r4.label) ? "cp" : null;
          if(tkey){
            cur.transport[submode][tkey] = [r4.nums[0], r4.nums[1]];
            for(var t = 0; t < nExit; t++){
              var ex6 = cur.exits[exitStart + t];
              if(ex6){
                ex6.transport[submode] = ex6.transport[submode] || {};
                ex6.transport[submode][tkey] = r4.nums[2 + t];
              }
            }
          }
        }
      }
    }
  }

  return { cases: cases, meta: meta };
}

if(typeof module !== "undefined" && module.exports){
  module.exports = { parseCEA: parseCEA, extractNumbers: extractNumbers, parseNumToken: parseNumToken };
}
