const debug = require('debug')('emulate')

var myArgs = process.argv.slice(2);
const emulate = myArgs[0] || 'AC12'
const emulate_init = './device/' + emulate + '.js'

// Load device specific init info
debug('Loading %s', emulate_init)
require(emulate_init)
const defaultTransmitPGNs = require(emulate_init).defaultTransmitPGNs
module.exports.defaultTransmitPGNs = defaultTransmitPGNs

const deviceAddress = myArgs[1];
//  const deviceAddress = require(emulate_init).deviceAddress;
module.exports.deviceAddress = deviceAddress;

debug('deviceAddress: %j', deviceAddress)

require('./canboatjs')
require('./canboatjs/lib/canbus')
const canDevice = require('./canboatjs/lib/canbus').canDevice
// const device = require('./canboatjs/lib/candevice').device
const canbus = new (require('./canboatjs').canbus)({})
const util = require('util')

var pilot_state = 'standby';
// var ac12mode = 'headinghold';
var ac12mode = 'navigation';
var lastac12mode = '';
var ac12state = 'engaged';
var part = 0
var wind_apparent_deg
var wind_target_deg
var cts_internal_rad = -6.370451767799999
var radians_per_degree = 0.01745329252
var cts_rad = "00,ff"

function hex2bin(hex){
    return ("00000000" + (parseInt(hex, 16)).toString(2)).substr(-8);
}

switch (emulate) {
  case 'AC12':
		if (process.stdin.isTTY) {
		  debug('DEBUG enabled. Using keyboard input for state changes.')
			const readline = require('readline');
			readline.emitKeypressEvents(process.stdin);
			process.stdin.setRawMode(true);
			process.stdin.on('keypress', (str, key) => {
			  if (key.ctrl && key.name === 'c') {
			    process.exit();
			  } else if (key.name === 'n') {
			    state_button = 'navigation'
			  } else if (key.name === 'f') {
			    ac12mode = 'followup'
			  } else if (key.name === 'h') {
			    state_button = 'headinghold'
			  } else if (key.name === 'u') {
			    // ac12mode = 'nonfollowup'
			  } else if (key.name === 'w') {
			    // ac12mode = 'wind'
          state_button = 'wind'
			  } else if (key.name === 'd') {
			    state_button= 'nodrift'
			  } else if (key.name === 'u') {
			    key_button = '-10'
			  } else if (key.name === 'i') {
			    key_button = '-1'
			  } else if (key.name === 'o') {
			    key_button = '+1'
			  } else if (key.name === 'p') {
			    key_button = '+10'
			  } else if (key.name === 'e') {
			    // ac12state = 'engaged'
          state_button = 'engage'
			  } else if (key.name === 's') {
			    // ac12state = 'standby'
			    state_button = 'standby'
			  } else if (key.name === 'return') {
			    console.log('')
			  } else if (key.name === '1') {
          part = part + 3
			  } else {
		      debug('Key %s not mapped.\n', key.name)
		    }
			});
		}
  break;
}

var commission_reply = {
  'ffffff180a0000ffffffff': 'ff,ff,ff,18,0a,00,02,00,ff,ff,ff', // <- Boat type: (00=Sail, 01=Outboard, 02=Displacement, 03=Planing)
  'ff64ff042d0000ffffffff': 'ff,64,ff,04,2d,00,02,a3,0d,ff,ff',
  'ffffff042d0000ffffffff': 'ff,ff,ff,04,2d,00,02,a3,0d,ff,ff',
  'ffffff3a000000ffffffff': 'ff,ff,ff,3a,00,00,02,00,00,ff,ff', // <- added
  'ffffff06000000ffffffff': 'ff,ff,ff,06,00,00,02,00,00,ff,ff', // <- added
  'ffffff100000ffffffffff': 'ff,ff,ff,10,00,02,ad,ac,7f,00,ff', // <- added
  'ffffff09010000ffffffff': 'ff,ff,ff,09,01,00,02,55,1b,ff,ff',
  'ffffff09020000ffffffff': 'ff,ff,ff,09,02,00,02,ab,e4,ff,ff',
  'ffffff1a0d0000ffffffff': 'ff,ff,ff,1a,0d,00,02,69,00,ff,ff',
  'ffffff190d0000ffffffff': 'ff,ff,ff,19,0d,00,02,45,00,ff,ff',
  'ffffff1a0f0000ffffffff': 'ff,ff,ff,1a,0f,00,02,6f,00,ff,ff',
  'ffffff190f0000ffffffff': 'ff,ff,ff,19,0f,00,02,49,00,ff,ff',
  'ffffff1a0e0000ffffffff': 'ff,ff,ff,1a,0e,00,02,90,01,ff,ff',
  'ffffff190e0000ffffffff': 'ff,ff,ff,19,0e,00,02,90,01,ff,ff',
  'ffffff1a100000ffffffff': 'ff,ff,ff,1a,10,00,02,af,12,33,00',
  'ffffff19100000ffffffff': 'ff,ff,ff,19,10,00,02,ad,cc,7f,00',
  'ffffff18020000ffffffff': 'ff,ff,ff,18,02,00,02,00,00,ff,ff',
  'ffffff1a110000ffffffff': 'ff,ff,ff,1a,11,00,02,08,ff,ff,ff',
  'ffffff19110000ffffffff': 'ff,ff,ff,19,11,00,02,04,ff,ff,ff',
  'ffffff1c110000ffffffff': 'ff,ff,ff,1c,11,00,02,04,ff,ff,ff',
  'ffffff18060000ffffffff': 'ff,ff,ff,18,06,00,02,00,ff,ff,ff',
  'ffffff09020000ffffffff': 'ff,ff,ff,09,02,00,02,ab,e4,ff,ff', // only in Aurora
  // 'ffffff180a0000ffffffff': 'ff,ff,ff,18,0a,00,02,01,ff,ff,ff',  
  'ffffff190d0000ffffffff': 'ff,ff,ff,19,0d,00,02,45,00,ff,ff',  // AutoSteer Low Rudder
  'ffffff190f0000ffffffff': 'ff,ff,ff,19,0f,00,02,49,00,ff,ff',  // AutoSteer Low Counter rudder
  'ffffff190e0000ffffffff': 'ff,ff,ff,19,0e,00,02,90,01,ff,ff',  // AutoSteer Low Auto trim
  'ffffff19100000ffffffff': 'ff,ff,ff,19,10,00,02,ad,cc,7f,00',  // AutoSteer Low Rate limit
  'ffffff1a0d0000ffffffff': 'ff,ff,ff,1a,0d,00,02,69,00,ff,ff',  // AutoSteer High Rudder
  'ffffff1a0f0000ffffffff': 'ff,ff,ff,1a,0f,00,02,6f,00,ff,ff',  // AutoSteer High Counter rudder
  'ffffff1a0e0000ffffffff': 'ff,ff,ff,1a,0e,00,02,90,01,ff,ff',  // AutoSteer High Auto trim
  'ffffff1a100000ffffffff': 'ff,ff,ff,1a,10,00,02,af,12,33,00',  // AutoSteer High Rate limit
  'ffffff18020000ffffffff': 'ff,ff,ff,18,02,00,02,00,00,ff,ff',
  'ffffff19110000ffffffff': 'ff,ff,ff,19,11,00,02,04,ff,ff,ff', // Mode High  -> Low
  'ffffff1a110000ffffffff': 'ff,ff,ff,1a,11,00,02,08,ff,ff,ff', // Mode High  -> High
  'ffffff1c110000ffffffff': 'ff,ff,ff,1c,11,00,02,04,ff,ff,ff', // Mode High  -> Wind
  'ffffff18060000ffffffff': 'ff,ff,ff,18,06,00,02,01,ff,ff,ff', // Sea state filter (00 = off, 01 = auto, 02 manual)
  'ffffff180c0000ffffffff': 'ff,ff,ff,18,0c,00,02,01,01,ff,ff', // Transition speed automatic steering 18,0c,00,01,01,01
  'ffffff14000000ffffffff': 'ff,ff,ff,14,00,00,02,00,00,ff,ff', // Rudder drive -> High Voltage
  'ffffff14060000ffffffff': 'ff,ff,ff,14,06,00,02,00,00,ff,ff',
  'ffffff14010000ffffffff': 'ff,ff,ff,14,01,00,02,27,ff,ff,ff', // Rudder drive ->
  'ffffff141d0000ffffffff': 'ff,ff,ff,14,1d,00,02,b0,04,ff,ff', // Rudder drive -> Voltage (12=60,09 24=b0,04)
  'ffffff1c010000ffffffff': 'ff,ff,ff,1c,01,00,02,74,14,ff,ff',
  'ffffff1c020000ffffffff': 'ff,ff,ff,1c,02,00,02,74,14,ff,ff',
  'ffffff1c080000ffffffff': 'ff,ff,ff,1c,08,00,02,78,00,ff,ff',  // Sailing -> Tack time
  'ffffff180b0000ffffffff': 'ff,ff,ff,18,0b,00,02,1c,47,ff,ff',  // Sailing -> Tack angle
  'ffffff1c090000ffffffff': 'ff,ff,ff,1c,09,00,02,11,00,ff,ff',  // Sailing -> Wind function LAYLINE,VGM,AUTO,TRUE,APPARENT
  'ffffff1b0c0000ffffffff': 'ff,ff,ff,1b,0c,00,02,d1,06,ff,ff',
  'ffffff180c0000ffffffff': 'ff,ff,ff,18,0c,00,02,01,01,ff,ff',
  'ffffff14090000ffffffff': 'ff,ff,ff,14,09,00,02,c1,0a,ff,ff',
  'ffffff18090000ffffffff': 'ff,ff,ff,18,09,00,02,07,00,ff,ff',
  'ffffff21090000ffffffff': 'ff,ff,ff,21,09,00,02,aa,c7,ff,ff',
  'ffffff1f1b0000ffffffff': 'ff,ff,ff,1f,1b,00,02,d0,07,ff,ff',
  'ffffff1f1a0000ffffffff': 'ff,ff,ff,1f,1a,00,02,d0,07,ff,ff',
  'ffffff21190000ffffffff': 'ff,ff,ff,21,19,00,02,aa,c7,0c,ff',
  'ffffff220b0000ffffffff': 'ff,ff,ff,22,b0,00,02,17,13,ff,ff',
  'ffffff221a0000ffffffff': 'ff,ff,ff,22,1a,00,02,88,13,ff,ff',
  'ffffff230d0000ffffffff': 'ff,ff,ff,23,0d,00,02,05,ff,ff,ff', // <- single setting?
  'ffffff1e1a0000ffffffff': 'ff,ff,ff,1e,1a,00,02,88,13,ff,ff',
  'fffffff200b000ffffffff': 'ff,ff,ff,20,0b,00,02,88,13,ff,ff',
  'fffffff201b000ffffffff': 'ff,ff,ff,20,1b,00,02,d0,07,ff,ff',
  'fffffff230d000ffffffff': 'ff,ff,ff,23,0d,00,02,05,ff,ff,ff',
  'fffffff230b000ffffffff': 'ff,ff,ff,23,0b,00,02,00,00,ff,ff',
  'fffffff040d000ffffffff': 'ff,ff,ff,04,0d,00,02,00,00,ff,ff',
  'fffffff0901000ffffffff': 'ff,ff,ff,09,01,00,02,55,1d,ff,ff',
  'fffffff0902000ffffffff': 'ff,ff,ff,09,02,00,02,ab,e4,ff,ff'
}

var heading;
// var heading_rad = 'ff,ff';
var heading_rad = '0a,0a';
var locked_heading;
var locked_heading_rad = 'ff,ff';
var mag_variation;

// Variables for multipacket pgns
var pgn130850 = [];
var pilotmode126720 = [];
var pgn129284 = [];
var pgn130845 = [];
var rudder_pgn_data = 'ff,f8,ff,ff,00,00,ff,ff';

// Raymarine setup
const raymarine_state_command = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,%s,00,00,00,00,ff,ff,ff,ff,ff";
const raymarine_state_code = {
    "standby":      "02,fd,00,00,00",
    "headinghold":  "01,fe,00,00,00",  // Heading Hold
    "wind":         "23,dc,00,00,00",  // Windvane mode
    "navigation":   "03,fc,3c,42,00"   // Track mode
}


const raymarine_key_command = "%s,3,126720,%s,%s,19,3b,9f,f0,81,86,21,%s,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff";
const raymarine_key_code = {
    "+1":      "07,f8",
    "+10":     "08,f7",
    "-1":      "05,fa",
    "-10":     "06,f9",
    "-1-10":   "21,de",
    "+1+10":   "22,dd"
}

key_command     = "%s,7,126720,%s,%s,16,3b,9f,f0,81,86,21,%s,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff" // ok
heading_command = "%s,3,126208,%s,%s,14,01,50,ff,00,f8,03,01,3b,07,03,04,06,%s,%s"
wind_command    = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,23,dc,00,00,00,00,00,00,ff,ff,ff,ff,ff",
route_command   = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,03,fc,3c,42,00,00,00,00,ff,ff,ff,ff,ff",
autopilot_dst = '115' // default converter device id

function changeHeading(app, deviceid, command_json)
{
  var ammount = command_json["value"]
  var state = pilot_state;
  var new_value
  var command_format
  var n2k_msgs

  debug("changeHeading: " + state + " " + ammount)
  if ( state == "auto" )
  {
    var current = heading_rad;
    new_value = radsToDeg(current) + ammount

    if ( new_value < 0 ) {
      new_value = 360 + new_value
    } else if ( new_value > 360 ) {
      new_value = new_value - 360
    }

    debug(`current heading: ${radsToDeg(current)} new value: ${new_value}`)

    command_format = heading_command
  }
  else if ( state == "wind" )
  {
    var current = app.getSelfPath(target_wind_path)
    new_value = radsToDeg(current) + ammount

    if ( new_value < 0 )
      new_value = 360 + new_value
    else if ( new_value > 360 )
      new_value = new_value - 360

    debug(`current wind angle: ${radsToDeg(current)} new value: ${new_value}`)
    command_format = wind_command
  }
  else
  {
    //error
  }
  if ( new_value )
  {
    new_value = Math.trunc(degsToRad(new_value) * 10000)
    n2k_msgs = [util.format(command_format, (new Date()).toISOString(), default_src,
                            autopilot_dst, padd((new_value & 0xff).toString(16), 2), padd(((new_value >> 8) & 0xff).toString(16), 2))]
  }
  return n2k_msgs
}

debug('Using device id: %i', canbus.candevice.address)

// Generic functions
function buf2hex(buffer) { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2));
}

function radsToDeg(radians) {
  return radians * 180 / Math.PI
}

function degsToRad(degrees) {
  return degrees * (Math.PI/180.0);
}

function padd(n, p, c)
{
  var pad_char = typeof c !== 'undefined' ? c : '0';
  var pad = new Array(1 + p).join(pad_char);
  return (pad + n).slice(-pad.length);
}

// Sleep
const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

// Heartbeat PGN 126993
const hexByte = require('./canboatjs/lib/utilities').hexByte
const heartbeat_msg = "%s,7,126993,%s,255,8,60,ea,%s,ff,ff,ff,ff,ff"
var heartbeatSequencenumber = 0

function heartbeat () {
  heartbeatSequencenumber++
  if (heartbeatSequencenumber > 600) {
    heartbeatSequencenumber = 1
  }
  msg = util.format(heartbeat_msg, (new Date()).toISOString(), canbus.candevice.address, hexByte(heartbeatSequencenumber))
  canbus.sendPGN(msg)
}

async function PGN130822 () {
  const messages = [
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0e,00,00,fc,13,25,00,00,74,be",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0f,00,00,fc,13,60,04,00,a3,5c",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,09,00,00,fc,12,1c,00,00,dd,d1",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0a,00,00,fc,13,b6,00,00,94,3a",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0b,00,00,fc,13,b9,00,00,16,67",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0c,00,00,fc,13,6f,00,00,03,bb",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0d,00,00,fc,13,25,00,00,74,be",
    "%s,3,130822,%s,255,0f,13,99,ff,01,00,0e,00,00,fc,13,25,00,00,74,be" ]
  for (var nr in messages) {
    msg = util.format(messages[nr], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(msg)
    await sleep(1000)
  }
}

function AC12_PGN130860 () {
  const message = "%s,7,130860,%s,255,21,13,99,ff,ff,ff,ff,7f,ff,ff,ff,7f,ff,ff,ff,ff,ff,ff,ff,7f,ff,ff,ff,7f"
  msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address)
  canbus.sendPGN(msg)
}

function AC12_PGN130850 () {
  const message = "%s,2,130850,%s,255,0c,41,9f,ff,ff,64,00,2b,00,ff,ff,ff,ff,ff"
  msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address)
  canbus.sendPGN(msg)
}

function AC12_PGN127250 () {
  // 2020-04-19-18:45:46.934,3,127250,7,255,8,0,3b,8f,ff,7f,0e,01,fd
  // 2020-04-19-18:46:19.480 2 115 255 127250 Vessel Heading:  SID = 0; Heading = 210.1 deg; Deviation = Unknown; Variation = Unknown; Reference = Magnetic
  const message = "%s,3,127250,%s,255,8,00,%s,ff,7f,ff,7f,fc" // fc = true, fd = magnetic
  var true_heading_deg = heading + mag_variation
  if (true_heading_deg < 0) {
    true_heading_deg += 360
  } else if (true_heading_deg > 360) {
    true_heading_deg -= 360
  }
  true_heading = Math.trunc(degsToRad(true_heading_deg) * 10000)
  magnetic_heading = Math.trunc(degsToRad(heading) * 10000)
  // debug ("heading_true_rad: %s  variation: %s", true_heading, mag_variation);
  // heading_hex = padd((magnetic_heading & 0xff).toString(16), 2) + "," + padd(((magnetic_heading >> 8) & 0xff).toString(16), 2)
  heading_hex = padd((true_heading & 0xff).toString(16), 2) + "," + padd(((true_heading >> 8) & 0xff).toString(16), 2)
  msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address, heading_hex)
  canbus.sendPGN(msg)
}

function AC12_PGN65341 () {
  if (ac12mode == 'wind') {
    if (ac12state == 'standby') {
      wind_target_deg = wind_apparent_deg
    }
    wind_target_rad = Math.trunc(degsToRad(wind_target_deg) * 10000)
    wind_target_hex = padd((wind_target_rad & 0xff).toString(16), 2) + "," + padd(((wind_target_rad >> 8) & 0xff).toString(16), 2)
    // debug ("wind_target_hex: %s wind_deg: %s", wind_target_hex, wind_target_deg);
    // B&G Wind target PGN
    const message = "%s,6,65341,%s,255,8,41,9f,ff,ff,03,ff,%s"
    msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address, wind_target_hex)
    canbus.sendPGN(msg)
  }
}

function AC12_PGN127245 () {
  const message = "%s,2,127245,%s,255,8,%s"
  msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address, rudder_pgn_data)
  canbus.sendPGN(msg)
}

function AC12_PGN128275 (log_pgn_data) {
  const message = "%s,2,128275,%s,255,8,%s"
  msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address, log_pgn_data)
  canbus.sendPGN(msg)
}

function AC12_PGN127237 () {
  const heading_track_pgn = {
      // "navigation" : "%s,2,127237,%s,%s,15,ff,7f,ff,ff,7f,%s,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s",    // Magnetic
      "navigation" : "%s,2,127237,%s,%s,15,ff,3f,ff,ff,7f,%s,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s",    // True
      // "headinghold": "%s,2,127237,%s,%s,15,ff,7f,ff,ff,7f,%s,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s", // Magnetic
      "headinghold": "%s,2,127237,%s,%s,15,ff,3f,ff,ff,7f,%s,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s",    // True
      // "wind":        "%s,2,127237,%s,%s,15,ff,7f,ff,ff,7f,ff,ff,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s", // Magnetic
      "wind":        "%s,2,127237,%s,%s,15,ff,3f,ff,ff,7f,ff,ff,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s", // True
       "standby":  "%s,2,127237,%s,%s,15,ff,7f,ff,ff,7f,ff,ff,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s" // Magnetic
      // "standby"    : "%s,2,127237,%s,%s,15,ff,3f,ff,ff,7f,ff,ff,00,00,ff,ff,ff,ff,ff,7f,ff,ff,ff,ff,%s" // True
  }

  cts_units = cts_internal_rad / 0.0001;
  cts_rad_local = padd((cts_units & 0xff).toString(16), 2) + "," + padd(((cts_units >> 8) & 0xff).toString(16), 2);
  if (ac12state == 'engaged') {
    debug('PGN127237: Rad local %s internal: %s units %s', cts_rad_local, cts_internal_rad, cts_units)
    switch (ac12mode) {
      case 'navigation':
        var msg = util.format(heading_track_pgn[ac12mode], (new Date()).toISOString(), canbus.candevice.address,255, cts_rad_local, heading_rad)
        debug('PGN127237: %s', msg)
        canbus.sendPGN(msg);
        break;
      case 'headinghold':
        var msg = util.format(heading_track_pgn[ac12mode], (new Date()).toISOString(), canbus.candevice.address,255, cts_rad_local, heading_rad)
        debug('PGN127237: %s', msg)
        debug('heading_rad: %s', heading_rad)
        debug('locked_heading_rad: %s', cts_rad_local)
        canbus.sendPGN(msg);
        break;
      case 'wind':
      case 'windnavigation':
        var msg = util.format(heading_track_pgn[ac12mode], (new Date()).toISOString(), canbus.candevice.address,255, locked_heading_rad, heading_rad)
        canbus.sendPGN(msg);
        break;
    }
  } else {
      var msg = util.format(heading_track_pgn['standby'], (new Date()).toISOString(), canbus.candevice.address, 255, heading_rad)
    canbus.sendPGN(msg);
  }
}

async function OP10_PGN65305 () {
  const messages = [
    "%s,7,65305,%s,255,8,41,9f,01,0b,00,00,00,00",
    "%s,7,65305,%s,255,8,41,9f,01,03,04,00,00,00" ]
  for (var nr in messages) {
    msg = util.format(messages[nr], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(msg)
    await sleep(25)
  }
}

async function AP44_PGN65305 () {
  const messages = [
    "%s,7,65305,%s,255,8,41,9f,01,03,00,00,00,00",
    "%s,7,65305,%s,255,8,41,9f,01,0b,00,00,00,00" ]
  for (var nr in messages) {
    msg = util.format(messages[nr], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(msg)
    await sleep(500)
  }
}


async function AC12_PGN65340 () {
  // Valid options:

  // Standby
  // 3,65340,2,255,8,41,9f,00,00,fe,f8,00,80
  // 7,65302,2,255,8,41,9f,0a,6b,00,00,00,ff

  // headinghold
  // 3,65340,2,255,8,41,9f,10,01,fe,fa,00,80
  // 7,65302,2,255,8,41,9f,0a,69,00,00,28,ff

  // 3,65340,2,255,8,41,9f,10,03,fe,fa,00,80
  // 7,65302,2,255,8,41,9f,0a,69,00,00,30,ff
  //
/*
3,65340,2,255,8,41,9f,00,00,fe,f8,00,80
3,65340,2,255,8,41,9f,00,00,fe,f9,00,80
3,65340,2,255,8,41,9f,10,01,fe,fa,00,80
3,65340,2,255,8,41,9f,10,03,fe,fa,00,80
*/

  const pgn65340 = {
      "standby":     "%s,3,65340,%s,255,8,41,9f,00,00,fe,f8,00,80",
      "headinghold": "%s,3,65340,%s,255,8,41,9f,10,01,fe,fa,00,80", // Heading Hold
      "followup":    "%s,3,65340,%s,255,8,41,9f,10,03,fe,fa,00,80", // Follow up
      "wind":        "%s,3,65340,%s,255,8,41,9f,10,03,fe,fa,00,80",
      "navigation":  "%s,3,65340,%s,255,8,41,9f,10,06,fe,f8,00,80"
  }
  const pgn65302 = {
      "standby":    "%s,7,65302,%s,255,8,41,9f,0a,6b,00,00,00,ff",
      "headinghold":"%s,7,65302,%s,255,8,41,9f,0a,69,00,00,28,ff", // Heading Hold
      "followup":   "%s,7,65302,%s,255,8,41,9f,0a,69,00,00,30,ff", // Follow up
      "wind":       "%s,7,65302,%s,255,8,41,9f,0a,69,00,00,30,ff",
      "navigation": "%s,7,65302,%s,255,8,41,9f,0a,6b,00,00,28,ff"  // guessing
  }
  const messages = [
    pgn65340[ac12mode],
    pgn65302[ac12mode] ]

  for (var nr in messages) {
    msg = util.format(messages[nr], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(msg)
    await sleep(25)
  }
}

function AC12_PGN65341_1s () {
  const message = "%s,6,65341,%s,255,8,41,9f,ff,ff,0d,ff,ff,7f";
  msg = util.format(message, (new Date()).toISOString(), canbus.candevice.address)
  canbus.sendPGN(msg)
}

async function AC12_PGN65341_5s () {
  const messages = [
    "%s,6,65341,%s,255,8,41,9f,ff,ff,0b,ff,00,00",
    "%s,6,65341,%s,255,8,41,9f,ff,ff,0c,ff,ff,ff",
    "%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,ff,ff" ]
  for (var nr in messages) {
    msg = util.format(messages[nr], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(msg)
    await sleep(25)
  }
}

function AC12_PGN65341_02 () {
  const pgn65341_02 = {
      "auto":       "%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,15,9a",
      "headinghold":"%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,00,00",
      "wind":       "%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,00,00",
      "navigation": "%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,12,00", // guess
      "followup":   "%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,14,9a", // guess
      "standby":    "%s,6,65341,%s,255,8,41,9f,ff,ff,02,ff,ff,ff"
  }
  msg = util.format(pgn65341_02[ac12mode], (new Date()).toISOString(), canbus.candevice.address)
  canbus.sendPGN(msg)
}

async function AC12_PGN65305 () {
  /*
    Determines what's shown as mode on B&G plotter.
    41,9f,00,1d determines mode
    41,9f,00,0[0a] determines state (standby/engaged)
  */

  // debug('AC12 mode: %s  state: %s', ac12mode, ac12state);

  if (ac12state == 'standby') {
    switch (ac12mode) {
      case 'headinghold':
        messages = [
          "%s,7,65305,%s,255,8,41,9f,00,02,02,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,0a,00,00,00" ]
        break;
      case 'wind':
          messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,02,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,1e,00,00,00" ]
        break;
      case 'followup': // unknown
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,02,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,0e,00,80,00" ]
        break;
      case 'navigation': // unknown
        messages = [
          "%s,7,65305,%s,255,8,41,9f,00,02,10,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,16,00,80,00" ]
        break;
      case 'nodrift': 
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,02,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,0c,00,80,00" ]
        break;
      case 'nonfollowup': // unknown
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,02,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,14,00,80,00" ]
        break;
    }
  } else if (ac12state == 'engaged') {
    switch (ac12mode) {
      case 'headinghold':
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,10,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,16,00,00,00" ]
        break;
      case 'wind':
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,10,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,06,04,00,00" ]
        break;
      case 'followup':
        messages = [
          "%s,7,65305,%s,255,8,41,9f,00,02,10,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,1e,00,80,00" ]
        break;
      case 'nodrift':
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,10,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,16,01,00,00" ]
        break;
      case 'navigation': // unknown
        messages = [
          "%s,7,65305,%s,255,8,41,9f,00,02,02,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,f0,00,80,00" ]
        break;
      case 'nonfollowup':  // unknown
        messages = [
          // "%s,7,65305,%s,255,8,41,9f,00,02,10,00,00,00",
          "%s,7,65305,%s,255,8,41,9f,00,0a,14,00,80,00" ]
        break;
    }
  }
  if (ac12mode != lastac12mode) {
    debug('ac12mode change detect. Last: %s Now: %s', lastac12mode, ac12mode);
    messages = [
      "%s,7,65305,%s,255,8,41,9f,00,1d,81,00,00,00",
      "%s,7,65305,%s,255,8,41,9f,00,1d,80,00,00,00"].concat[messages]
    lastac12mode = ac12mode
  }
  for (var message in messages) {
    msg = util.format(messages[message], (new Date()).toISOString(), canbus.candevice.address)
    canbus.sendPGN(msg)
    msg = msg.replace(/.*255,8,41,9f,00,/, '');
    msgbin = "";
    msg.split(",").forEach(str => {
      msgbin += hex2bin(str) + " "
    });
    // debug('Sending PGN 65305: %s %s', msg, msgbin);
    await sleep(25)
  }
}



switch (emulate) {
  case 'default':
      setTimeout(PGN130822, 5000) // Once at startup
  case 'OP10keypad':
      debug('Emulate: B&G OP10 Keypad')
      setInterval(PGN130822, 300000) // Every 5 minutes
      setInterval(OP10_PGN65305, 1000) // unsure
      setInterval(heartbeat, 60000) // Heart beat PGN
      break;
  case 'keypad':
      debug('Emulate: B&G Triton2 Keypad')
      setInterval(PGN130822, 300000) // Every 5 minutes
      setInterval(heartbeat, 60000) // Heart beat PGN
      break;
	case 'AP44':
	    debug('Emulate: Simrad AP44 Autopilot controller')
      setInterval(PGN130822, 300000) // Every 5 minutes
      setInterval(AP44_PGN65305, 1000) // Every 1 minute
      setInterval(heartbeat, 60000) // Heart beat PGN
	    break;
	case 'AC12':
	    debug('Emulate: Simrad AC12 Autopilot')
      setInterval(PGN130822, 300000) // Every 5 minutes
      setInterval(AC12_PGN65340, 1000) // Every second
      setInterval(AC12_PGN65341, 1000) // Wind target angle
      setInterval(AC12_PGN65341_02, 5000) // Every 5 second
      // setInterval(AC12_PGN65341_1s, 1000) // Every second
      setInterval(AC12_PGN65341_5s, 5000) // Every 5 seconds
      setInterval(AC12_PGN65305, 1000)
      // setInterval(AC12_PGN127245, 200); // Every 200ms
      setInterval(AC12_PGN130860, 1000) // Every second
      setInterval(heartbeat, 60000) // Heart beat PGN
      setInterval(AC12_PGN127237, 500) // Heading/track PGN
      setInterval(AC12_PGN127250, 500) // True heading
      // setInterval(AC12_PGN130850, 5000) // Controlling device
 	    break;
}

function mainLoop () {
	while (canbus.readableLength > 0) {
	//debug('canbus.readableLength: %i', canbus.readableLength)
    msg = canbus.read()
		// debug('Received packet msg: %j', msg)
	  // debug('msg.pgn.src %i != canbus.candevice.address %i?', msg.pgn.src, canbus.candevice.address)
    if ( msg.pgn.dst == canbus.candevice.address || msg.pgn.dst == 255) {
      msg.pgn.fields = {};
      if (msg.pgn.pgn == 59904) {
        PGN = msg.data[2] * 256 * 256 + msg.data[1] * 256 + msg.data[0];
        debug('ISO request: %j', msg);
        debug('ISO request from %d to %d Data PGN: %i', msg.pgn.src, msg.pgn.dst, PGN);
        msg.pgn.fields.PGN = PGN;
        canbus.candevice.n2kMessage(msg.pgn);
      }
      switch (emulate) {
        case 'AC12':
          if (msg.pgn.pgn == 130850 || typeof key_button !== 'undefined' || typeof state_button !== 'undefined') { // Button or Simnet Event, requires reply
            pgn130850 = pgn130850.concat(buf2hex(msg.data).slice(1)); // Skip multipart byte
            PGN130850 = pgn130850.join(',');
            if (!PGN130850.match(/^..,41,9f,..,ff,ff,/)) {
              pgn130850 = [];
            }

            if (pgn130850.length > 8 || typeof key_button !== 'undefined' || typeof state_button !== 'undefined') { // We have 2 parts now or a button
              debug ('Event AP command: %j %s', msg.pgn, PGN130850);

              // B&G autopilot button matching
              // if (PGN130850.match(/^0c,41,9f,01 <- Autopilot device id
              if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,1a,00,02,ae,00/)) { // -1
                key_button = "-1";
		  cts_internal_rad -= radians_per_degree;
                  debug('B&G button press -1, subtracted number.');
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,1a,00,03,ae,00/)) { // +1
                  key_button = "+1";
		  cts_internal_rad += radians_per_degree;
                  debug('B&G button press +1, added number.');
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,1a,00,02,d1,06/)) { // -10
                key_button = "-10";
                debug('B&G button press -10');
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,1a,00,03,d1,06/)) { // +10
                key_button = "+10";
                debug('B&G button press +10');
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,1a,00,02,5b,3d/)) { // Tack Starboard
                key_button = "+1+10";
                debug('B&G button press tack > starboard');
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,1a,00,03,5b,3d/)) { // Tack Port
                key_button = "-1-10";
                debug('B&G button press tack < port');
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,06,00,ff,ff,ff/)) { // Standby
                state_button = "standby";
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,0a,00,ff,ff,ff/)) {
                ac12mode = "navigation";
                state_button = "navigation";
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,0f,00,ff,ff,ff/)) {
                state_button = "wind";
                ac12mode = "wind";
                debug('B&G mode now %s', ac12mode);
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,10,00,ff,ff,ff/)) {
                ac12mode = "windnavigation";
                debug('B&G mode now %s', ac12mode);
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,0c,00,ff,ff,ff/)) {
                ac12mode = "nodrift";
                debug('B&G mode now %s', ac12mode);
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,09,00,ff,ff,ff/)) { // Heading Hold
                ac12mode = "headinghold";
                state_button = "headinghold";
                debug('B&G mode now %s', ac12mode);
              } else if (PGN130850.match(/^0c,41,9f,..,ff,ff,..,09,00,ff,ff,ff/)) { // Engage
                state_button = "engage";
                debug('B&G engaging mode %s', ac12mode);

              // Clear 'No Autopilot' alarm?
              } else if (PGN130850.match(/41,9f,ff,ff,ff,1f,51,00,c4,49,29/)) {
                pgn130851.replace(',51,', ',52,');
              }

              debug('AC12 mode: %s  state: %s', ac12mode, ac12state);

              // Send Seatalk Button
              if (typeof key_button != 'undefined' && key_button) {
                  debug('Setting Seatalk1 pilot mode %s', key_button);
                  pgn126720 = util.format(raymarine_key_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_key_code[key_button]);
                  debug('Sending Seatalk key button pgn 126720 %j', pgn126720);
                  canbus.sendPGN(pgn126720);
                  delete key_button;
              }
              // Send Seatalk State button
              if (typeof state_button != 'undefined' && state_button) {
                  if (state_button == 'engage') {
                    debug('B&G button Engage pressed. Engaging mode %s', ac12mode)
                    pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code[ac12mode]);
                    debug('Sending Seatalk key state pgn 126720 %j', pgn126720);
                    canbus.sendPGN(pgn126720);
                  } else if (state_button == 'headinghold') {
                      debug('B&G button Engage pressed. Engaging mode %s', ac12mode)
		      ac12state = 'engaged'
                    pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code['headinghold']);
                    debug('Sending Seatalk key state pgn 126720 %j', pgn126720);
                    canbus.sendPGN(pgn126720);
                  } else if (state_button == 'wind') {
                    debug('B&G button Standby pressed. Wind in mode %s', ac12mode)
                    pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code['wind']);
                    debug('Sending Seatalk key state pgn 126720 %j', pgn126720);
                    canbus.sendPGN(pgn126720);
                  } else if (state_button == 'nodrift') {
                    debug('B&G button NoDrift pressed.', ac12mode)
                    pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code['headinghold']);
                    debug('Sending Seatalk key state pgn 126720 %j', pgn126720);
                    canbus.sendPGN(pgn126720);
                  } else if (state_button == 'navigation') {
                    debug('B&G button Navigation pressed. Navigation in state %s', ac12state)
                    if (ac12state == 'standby') {
                      debug('Going to Heading Hold first')
                      pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code['headinghold']);
                      canbus.sendPGN(pgn126720);
                    }
                    pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code['navigation']);
                    debug('Sending Seatalk key state pgn 126720 %j', pgn126720);
                    canbus.sendPGN(pgn126720);
                  } else if (state_button == 'standby') {
                      debug('B&G button Standby pressed. Standby in mode %s', ac12mode)
		      ac12state = 'standby';
                    pgn126720 = util.format(raymarine_state_command, (new Date()).toISOString(), canbus.candevice.address, autopilot_dst, raymarine_state_code['standby']);
                    debug('Sending Seatalk key state pgn 126720 %j', pgn126720);
                    canbus.sendPGN(pgn126720);
                  }
              }
              delete state_button;
              delete key_button;

              // Send 130851 reply packet
              pgn130851_size = pgn130850[0];
              pgn130851_size_int = parseInt(pgn130850[0], 16);
              pgn130851 = "%s,7,130851,%s,255," + pgn130851_size + "," + (pgn130850.slice(1,pgn130851_size_int + 1)).join(',');
              pgn130851 = util.format(pgn130851, (new Date()).toISOString(), canbus.candevice.address)
              // debug('Sending reply 130851 %j', pgn130851);
              canbus.sendPGN(pgn130851)
              pgn130850 = [];
            }
          // Seatalk1 pilot mode
          } else if (msg.pgn.pgn == 126720) {
            // 16,3b,9f,f0,81
            pilotmode126720 = pilotmode126720.concat(buf2hex(msg.data).slice(1)); // Skip multipart byte
            Seatalkmode = pilotmode126720.join(',');
            if (!Seatalkmode.match(/^16,3b,9f,f0,81,84/)) {
              pilotmode126720 = [];
            }
            if (pilotmode126720.length > 24) { // We have 4 parts now
              // debug('Seatalk pilot mode: %s', Seatalkmode)
              if (Seatalkmode.match(/16,3b,9f,f0,81,84,..,..,..,42,/)) {
                if (pilot_state != 'auto') {
                  debug('Following Seatalk1 pilot mode heading hold engaged: %s', Seatalkmode);
                  pilot_state = 'auto';
                  ac12mode = 'headinghold';
                  ac12state = 'engaged';
                  AC12_PGN65341_02();
                  debug('Raymarine mode: %s  AC12 mode: %s  state: %s', pilot_state, ac12mode, ac12state);
                }
              } else if (Seatalkmode.match(/16,3b,9f,f0,81,84,..,..,..,46,/)) {
                if (pilot_state != 'wind') {
                  debug('Following Seatalk1 pilot mode wind: %s', Seatalkmode);
                  pilot_state = 'wind';
                  ac12mode = 'wind';
                  ac12state = 'engaged';
                  wind_target_deg = wind_apparent_deg
                  debug('Setting target wind to: %s', wind_target_deg)
                  AC12_PGN65341_02();
                  debug('Raymarine mode: %s  AC12 mode: %s  state: %s', pilot_state, ac12mode, ac12state);
                }
              } else if (Seatalkmode.match(/16,3b,9f,f0,81,84,..,..,..,4[08],/) || Seatalkmode.match(/16,3b,9f,f0,81,84,..,..,..,44,/) ) {
                if (pilot_state != 'standby') {
                  debug('Following Seatalk1 pilot mode standby: %s', Seatalkmode);
                  pilot_state = 'standby'
                  ac12state = 'standby';
                  AC12_PGN65341_02();
                  debug('Raymarine mode: %s  AC12 mode: %s  state: %s', pilot_state, ac12mode, ac12state);
                }
              } else if (Seatalkmode.match(/16,3b,9f,f0,81,84,..,..,..,4a,/) || Seatalkmode.match(/16,3b,9f,f0,81,84,..,..,..,44,/) ) {
                if (pilot_state != 'navigation') {
                  debug('Following Seatalk1 pilot mode route (navigation): %s', Seatalkmode);
                  pilot_state = 'navigation'
                  ac12mode = 'navigation';
                  ac12state = 'engaged';
                  AC12_PGN65341_02();
                  debug('Raymarine mode: %s  AC12 mode: %s  state: %s', pilot_state, ac12mode, ac12state);
                }
              }
              pilotmode126720=[]
            }

          } else if (msg.pgn.pgn == 65359) {
          // Get heading from Seatalk1 packet
            // debug ('Seatalk1 Pilot heading info: %j %j', msg.pgn, msg.data);
            var heading_true_rad = buf2hex(msg.data).slice(3,5);
            var heading_mag_rad = buf2hex(msg.data).slice(5,7);
            // debug ("heading_true_rad: %s heading_mag_rad: %s", heading_true_rad, heading_mag_rad);
            if (heading_true_rad[0] != 'ff') {
              heading_rad = heading_true_rad
            } else {
              heading_rad = heading_mag_rad
            }
            heading = radsToDeg(parseInt('0x' + heading_rad[1] + heading_rad[0]))/10000
            heading_rad = heading_rad.join(',')
            // debug('heading: %s', heading)

          } else if (msg.pgn.pgn == 65360) {
          // Get locked heading from Seatalk1 packet
            // debug ('Seatalk1 Pilot locked heading info: %j %j', msg.pgn, msg.data);
            var locked_heading_true_rad = buf2hex(msg.data).slice(3,5);
            var locked_heading_mag_rad = buf2hex(msg.data).slice(5,7);
            debug ("heading_true_rad: %s heading_mag_rad: %s", heading_true_rad, heading_mag_rad);
            if (locked_heading_true_rad[0] != 'ff') {
              locked_heading_rad = locked_heading_true_rad
            } else {
              locked_heading_rad = locked_heading_mag_rad
            }
            locked_heading = radsToDeg(parseInt('0x' + locked_heading_rad[1] + locked_heading_rad[0]))/10000;
            locked_heading_rad = locked_heading_rad.join(',')
            // debug('locked heading: %s', locked_heading)

          } else if (msg.pgn.pgn == 130306) {
          // Get apparent wind angle
            wind_apparent_rad = buf2hex(msg.data).slice(3,5);
            wind_apparent_deg = Math.round(radsToDeg(parseInt('0x' + wind_apparent_rad[1] + wind_apparent_rad[0]))/10000);
            // debug ('Wind: %s', wind_apparent_deg);

          } else if (msg.pgn.pgn == 127245 && msg.pgn.src == 115) {
          // Get rudder angle info from Seatalk1 packet
            // 2021-11-22-23:26:00.156,2,127245,115,255,8,ff,f8,ff,ff,00,00,ff,ff
            rudder_pgn_data = buf2hex(msg.data).join(',');
            // debug('Rudder data: %s', rudder_pgn_data)
            AC12_PGN127245(rudder_pgn_data);
          } else if (msg.pgn.pgn == 128275 && msg.pgn.src == 115) {
          // Get distance log info from Seatalk1 packet
            // Isn't working well
            // AC12_PGN128275(buf2hex(msg.data));
          } else if (msg.pgn.pgn == 127258)  {
          // Get variation info to turn into true heading
            mag_variation = radsToDeg(parseInt('0x' + buf2hex(msg.data)[5] + buf2hex(msg.data)[4]))/10000;
            // debug('Got variation from 127258: %s', mag_variation)
          } else if (msg.pgn.pgn == 129284) { // Navigation bearing info
            // Header?
            if (pgn129284.length == 0) {
              pgn129284 = pgn129284.concat(buf2hex(msg.data));
            } else {
              pgn129284 = pgn129284.concat(buf2hex(msg.data).slice(1)); // Skip multipart byte
            }
            PGN129284 = pgn129284.join(',');
            if (!PGN129284.match(/^[02468ace]0,22,/)) {
              pgn129284 = [];
            }
            if (pgn129284.length > 32) { // We have 6 parts now
              PGN129284 = PGN129284.substring(3)
              cts_rad = PGN129284.substring(45,50)
              // debug('PGN129284: %s %s', cts_rad, PGN129284)
              pgn129284 = [];
            }
          } else if (msg.pgn.pgn == 130845) { // Commission Simnet reply
              pgn130845 = pgn130845.concat(buf2hex(msg.data).slice(1)); // Skip multipart byte
              PGN130845 = pgn130845.join(',');
              if (!PGN130845.match(/^0e,41,9f/)) {
                debug('PGN130845 not ok: %s', PGN130845);
                pgn130845 = [];
              }
              if (pgn130845.length > 14) { // We have 3 parts now
                debug('PGN130845[3]: %s', PGN130845.split(',')[3]);
                PGN130845_1 = PGN130845.replace(/,/g,'').substring(0,8);
                PGN130845_key = PGN130845.replace(/,/g,'').substring(8,30);
                PGN130845_reply = PGN130845.substring(0,12);
                // Read or write?
                if (PGN130845.match(/^0e,41,9f,(00|73),ff,ff,ff,..,..,00,00/)) {
                  // Read
                  PGN130845_value = commission_reply[PGN130845_key];
                  if (PGN130845_value === undefined) {
                    debug('130845: missing %s', PGN130845_key);
                  } else {
                    debug('130845: Request %s  Reply %s', PGN130845_key, PGN130845_value);
                    PGN130845_reply = PGN130845_reply + PGN130845_value
                  }
                } else if (PGN130845.match(/^0e,41,9f,00,ff,ff,ff,..,..,00,0[12]/)) {
                  // Write
                  PGN130845_reply = PGN130845.substring(12,44)
                  PGN130845_key = PGN130845_key.replace(/0001......../, '0000ffffffff');
                  PGN130845_reply = PGN130845_reply.replace(/(ff,ff,ff,..,..),(..,..)/, '$1,00,02');
                  debug('130845: Write   %s  Reply %s', PGN130845_key, PGN130845_reply);
                  commission_reply[PGN130845_key] = PGN130845_reply
                  PGN130845_reply = PGN130845;
                } else {
                  // Unclear
                  debug('PGN130845 unclear type: %s', PGN130845)
                  PGN130845_reply = PGN130845.substring(14,500)
                }
                PGN130845_reply = "%s,3,130845,%s,255," + PGN130845_reply;
                PGN130845_reply = util.format(PGN130845_reply, (new Date()).toISOString(), canbus.candevice.address)
                // debug('PGN130845 reply: %s', PGN130845_reply)
                canbus.sendPGN(PGN130845_reply)
                pgn130845 = [];
              } 
            }
          break;
        default:
      }
    }
	}
  setTimeout(mainLoop, 50)
}

// Wait for cansend
function waitForSend () {
  if (canbus.candevice.cansend) {
    mainLoop()
    return
  }
  setTimeout (waitForSend, 500)
}

waitForSend()
