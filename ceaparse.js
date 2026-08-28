"use strict";

/* ---------------- CEA number parsing ---------------- */
// CEA prints floats as mantissa + optional exponent. The exponent is either
// a separate "digit" token (e.g. "1.1357 1" -> 11.357) or glued on when
// negative (e.g. "9.4144-1" -> 0.94144).
var CEA_NUM_RE = /-?\d+\.\d+(?:-\d|\s\d(?=\s|$))?/g;

function parseNumToken(tok){
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

/* ---------------- CEA output parser ---------------- */
function parseCEA(text){
  var lines = text.split(/\r?\n/);
  var cases = [];
  var meta = { fuels: [], oxidizers: [], problemType: null, assumption: null, compType: "mass", options: [], hasTransport: false };
  var cur = null;
  var mode = "none"; // none | props | perf | massfrac | transport
  var submode = null; // equil | frozen (within transport)

  for(var i = 0; i < lines.length; i++){
    var line = lines[i];

    // assumption (equilibrium / frozen) - appears in each section header
    if(!meta.assumption && /ASSUMING\s+(EQUILIBRIUM|FROZEN)/i.test(line)){
      meta.assumption = /FROZEN/i.test(line) ? "Frozen" : "Equilibrium";
    }

    // meta (only from the file header, before the first case)
    if(!cur){
      var mm = line.match(/Problem Type:\s*"?([A-Za-z ]+)"?/i);
      if(mm) meta.problemType = mm[1].trim();
      mm = line.match(/^\s*fuel\s+(\S+)/i);
      if(mm) meta.fuels.push(mm[1]);
      mm = line.match(/^\s*oxid\s+(\S+)/i);
      if(mm) meta.oxidizers.push(mm[1]);
      mm = line.match(/^\s*output\s+(\S+)/i);
      if(mm) meta.options.push(mm[1]);
    }

    var m = line.match(/Pin\s*=\s*([\d.]+)\s*PSIA/i);
    if(m){
      cur = { pin: parseFloat(m[1]), chamber: {}, throat: {}, perf: {}, massfrac: {}, transport: {} };
      cases.push(cur);
      mode = "none";
      continue;
    }
    if(!cur) continue;

    m = line.match(/O\/F\s*=\s*([\d.]+)/);
    if(m){
      cur.of = parseFloat(m[1]);
      var f = line.match(/%FUEL\s*=\s*([\d.]+)/);
      if(f) cur.pctFuel = parseFloat(f[1]);
      mode = "none";
      continue;
    }

    if(/CHAMBER\s+THROAT/.test(line)){ mode = "props"; continue; }
    if(/TRANSPORT\s+PROPERTIES/.test(line)){
      mode = "transport"; submode = null;
      meta.hasTransport = true;
      cur.transport = { viscosity: null, equil: {}, frozen: {} };
      continue;
    }
    if(/PERFORMANCE\s+PARAMETERS/.test(line)){ mode = "perf"; continue; }
    if(/MASS\s+FRACTIONS/.test(line)){ meta.compType = "mass"; mode = "massfrac"; continue; }
    if(/MOLE\s+FRACTIONS/.test(line)){ meta.compType = "mole"; mode = "massfrac"; continue; }

    if(mode === "props"){
      var r = extractNumbers(line);
      if(r.nums.length === 2 && r.label){
        var key = PROP_ALIASES[r.label] || r.label;
        cur.chamber[key] = r.nums[0];
        cur.throat[key] = r.nums[1];
      }
    } else if(mode === "perf"){
      var r2 = extractNumbers(line);
      if(r2.nums.length === 1 && r2.label){
        var k2 = PERF_ALIASES[r2.label] || r2.label;
        cur.perf[k2] = r2.nums[0];
      }
    } else if(mode === "massfrac"){
      var r3 = extractNumbers(line);
      if(r3.nums.length === 2 && r3.label && !/THERMODYNAMIC|NOTE/i.test(r3.label)){
        cur.massfrac[r3.label] = [r3.nums[0], r3.nums[1]];
      }
    } else if(mode === "transport"){
      if(/WITH\s+EQUILIBRIUM\s+REACTIONS/.test(line)){ submode = "equil"; continue; }
      if(/WITH\s+FROZEN\s+REACTIONS/.test(line)){ submode = "frozen"; continue; }
      var r4 = extractNumbers(line);
      if(r4.nums.length === 2 && r4.label){
        if(/VISC/.test(r4.label)){ cur.transport.viscosity = [r4.nums[0], r4.nums[1]]; }
        else if(/CONDUCTIVITY/.test(r4.label)){ if(submode) cur.transport[submode].cond = [r4.nums[0], r4.nums[1]]; }
        else if(/PRANDTL/.test(r4.label)){ if(submode) cur.transport[submode].prandtl = [r4.nums[0], r4.nums[1]]; }
        else if(/^Cp/.test(r4.label)){ if(submode) cur.transport[submode].cp = [r4.nums[0], r4.nums[1]]; }
      }
    }
  }
  return { cases: cases, meta: meta };
}

if(typeof module !== "undefined" && module.exports){
  module.exports = { parseCEA: parseCEA, extractNumbers: extractNumbers, parseNumToken: parseNumToken };
}
