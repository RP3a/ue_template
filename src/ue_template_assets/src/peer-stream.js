/* eslint-disable */

import App, { AppContext, ReceivedFromUnreal } from "./App";


// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
const MouseButton = {
  MainButton: 0, // Left button.
  AuxiliaryButton: 1, // Wheel button.
  SecondaryButton: 2, // Right button.
  FourthButton: 3, // Browser Back button.
  FifthButton: 4, // Browser Forward button.
};

// Must be kept in sync with PixelStreamingProtocol::EToClientMsg C++ enum.
const RECEIVE = {
  QualityControlOwnership: 0,
  Response: 1,
  Command: 2,
  FreezeFrame: 3,
  UnfreezeFrame: 4,
  VideoEncoderAvgQP: 5,
  LatencyTest: 6,
  InitialSettings: 7,
  FileExtension: 8,
  FileMimeType: 9,
  FileContents: 10,
};

// Must be kept in sync with PixelStreamingProtocol::EToUE4Msg C++ enum.
const SEND = {
  /*
   * Control Messages. Range = 0..49.
   */
  IFrameRequest: 0,
  RequestQualityControl: 1,
  FpsRequest: 2,
  AverageBitrateRequest: 3,
  StartStreaming: 4,
  StopStreaming: 5,
  LatencyTest: 6,
  RequestInitialSettings: 7,
  /*
   * Input Messages. Range = 50..89.
   */

  // Generic Input Messages. Range = 50..59.
  UIInteraction: 50,
  Command: 51,

  // Keyboard Input Message. Range = 60..69.
  KeyDown: 60,
  KeyUp: 61,
  KeyPress: 62,

  // Mouse Input Messages. Range = 70..79.
  MouseEnter: 70,
  MouseLeave: 71,
  MouseDown: 72,
  MouseUp: 73,
  MouseMove: 74,
  MouseWheel: 75,

  // Touch Input Messages. Range = 80..89.
  TouchStart: 80,
  TouchEnd: 81,
  TouchMove: 82,

  // Gamepad Input Messages. Range = 90..99
  GamepadButtonPressed: 90,
  GamepadButtonReleased: 91,
  GamepadAnalog: 92,
};

class PeerStream extends HTMLVideoElement {
  constructor(...params) {
    super(...params);

    window.ps = this;

    this.ws = { send() {}, close() {} }; // WebSocket
    this.pc = { close() {} }; // RTCPeerConnection

    // this.setupVideo();
 



    this.addEventListener("loadeddata", (e) => {
      this.style["aspect-ratio"] = this.videoWidth / this.videoHeight;
    });
  }

  // setupWebsocket
  async connectedCallback() {
    // This will happen each time the node is moved, and may happen before the element"s contents have been fully parsed. may be called once your element is no longer connected
    if (!this.isConnected) return;

    let signal = this.getAttribute("signal");
    if (!signal) {
      const ip = this.getAttribute("ip") || location.hostname || "localhost";
      const port = this.getAttribute("port") || 88;
      const token = this.getAttribute("token") || "hello";
      signal = `wss://${ip}:${port}/${token}`;
    }

    // await new Promise((res) => setTimeout(res, 1000));
    this.ws.close(1000, "Infinity");
    this.ws = new WebSocket(signal);

    this.ws.onerror = (e) => {
      console.log(e);
    };

    this.ws.onopen = async (e) => {
      console.info("✅ connected to", this.ws.url);

      // this.pc.restartIce();

      clearInterval(this.ping);
      this.ping = setInterval(() => {
        this.ws.send("ping");
      }, 1000 * 50);
    };

    this.ws.onmessage = (e) => {
      this.onWebSocketMessage(e.data);
    };

    this.ws.onclose = (e) => {
      console.info("❌ signaler closed:", e.reason || e.code);
      clearInterval(this.ping);
      const timeout = +e.reason || 3000;
      if (timeout === Infinity) return;

      clearTimeout(this.reconnect);
      this.reconnect = setTimeout(() => this.connectedCallback(), timeout);
    };

    this.setupPeerConnection();
  }

  disconnectedCallback() {
    // WebRTC bound to <video>
    this.ws.close(1000, "Infinity");
    this.pc.close();
    console.log("❌ peer connection closing");
    // this.dc.close();
  }

  adoptedCallback() {}

  static observedAttributes = ["signal", "ip", "port", "token"];
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected) return;
    // fired before connectedCallback when startup // trigger at beggining：oldValue from null to newValue
    this.ws.close(1000, "1");
  }

  async onWebSocketMessage(msg) {
    try {
      msg = JSON.parse(msg);
    } catch {
      console.debug("↓↓", msg);
      return;
    }
    if (msg.type === "offer") {
      const offer = new RTCSessionDescription(msg);
      console.log("↓↓ offer", offer);

      await this.pc.setRemoteDescription(offer);


      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      console.log("↑↑ answer", answer);
      this.ws.send(JSON.stringify(answer));

      for (let receiver of this.pc.getReceivers()) {
        receiver.playoutDelayHint = 0;
      }
    } else if (msg.type === "iceCandidate") {
      const candidate = new RTCIceCandidate(msg.candidate);
      console.log("↓↓ candidate:", candidate);
      await this.pc.addIceCandidate(candidate);
    } else if (msg.type === "answer") {
      // deprecated
    } else {
      console.warn("↓↓", msg);
    }
  }

  onDataChannelMessage(data) {
    data = new Uint8Array(data);
    const utf16 = new TextDecoder("utf-16");
    switch (data[0]) {
      case RECEIVE.VideoEncoderAvgQP: {
        this.VideoEncoderQP = +utf16.decode(data.slice(1));
        console.debug("↓↓ QP:", this.VideoEncoderQP);
        break;
      }
      case RECEIVE.Response: {
        // user custom message
        const detail = utf16.decode(data.slice(1));
        this.dispatchEvent(new CustomEvent("message", { detail }));                              
        ReceivedFromUnreal(detail);
        break;
      }      
      case RECEIVE.Command: {
        const command = JSON.parse(utf16.decode(data.slice(1)));
        console.info("↓↓ command:", command);
        if (command.command === "onScreenKeyboard") {
          console.info("You should setup a on-screen keyboard");
        }
        break;
      }
      case RECEIVE.FreezeFrame: {
        const size = new DataView(data.slice(1, 5).buffer).getInt32(0, true);
        const jpeg = data.slice(1 + 4);
        console.info("↓↓ freezed frame:", jpeg);
        break;
      }
      case RECEIVE.UnfreezeFrame: {
        console.info("↓↓ 【unfreeze frame】");
        break;
      }
      case RECEIVE.LatencyTest: {
        const latencyTimings = JSON.parse(utf16.decode(data.slice(1)));
        console.info("↓↓ latency timings:", latencyTimings);
        break;
      }
      case RECEIVE.QualityControlOwnership: {
        this.QualityControlOwnership = data[1] !== 0;
        console.info("↓↓ Quality Control Ownership:", this.QualityControlOwnership);
        break;
      }
      case RECEIVE.InitialSettings: {
        this.InitialSettings = JSON.parse(utf16.decode(data.slice(1)));
        console.log("↓↓ initial setting:", this.InitialSettings);
        break;
      }
      default: {
        console.error("↓↓ invalid data:", data);
      }
    }
  }

  
  setupDataChannel(e) {
    // See https://www.w3.org/TR/webrtc/#dom-rtcdatachannelinit for values (this is needed for Firefox to be consistent with Chrome.)
    // this.dc = this.pc.createDataChannel(label, { ordered: true });

    this.dc = e.channel;

    // Inform browser we would like binary data as an ArrayBuffer (FF chooses Blob by default!)
    this.dc.binaryType = "arraybuffer";

    this.dc.onopen = (e) => {
      console.log("✅ data channel connected");
      this.style.pointerEvents = "auto";
      this.dc.send(new Uint8Array([SEND.RequestInitialSettings]));
      this.dc.send(new Uint8Array([SEND.RequestQualityControl]));      
    };

    this.dc.onclose = (e) => {
      console.info("❌ data channel closed");
      this.style.pointerEvents = "none";
      
    };

    this.dc.onerror = (e) => {};

    this.dc.onmessage = (e) => {
      this.onDataChannelMessage(e.data);
    };
  }

  setupPeerConnection() {
    this.pc.close();
    this.pc = new RTCPeerConnection({
      sdpSemantics: "unified-plan",
      bundlePolicy: "balanced",
      // iceServers: [
      //   {
      //     urls: [
      //       "stun:stun.l.google.com:19302",
      //       "stun:stun1.l.google.com:19302",
      //       "stun:stun2.l.google.com:19302",
      //       "stun:stun3.l.google.com:19302",
      //       "stun:stun4.l.google.com:19302",
      //     ],
      //   },
      // ],
    });

   
    this.pc.onicecandidate = (e) => {
      // firefox
      if (e.candidate?.candidate) {
        console.log("↑↑ candidate:", e.candidate);
        this.ws.send(JSON.stringify({ type: "iceCandidate", candidate: e.candidate }));
      } else {
        // Notice that the end of negotiation is detected here when the event"s candidate property is null.
      }
    };


    this.pc.ondatachannel = (e) => {
      this.setupDataChannel(e);
    };
  }


  // emit string
  emitMessage(msg, messageType = SEND.UIInteraction) {
    if (typeof msg !== "string") msg = JSON.stringify(msg);

    // Add the UTF-16 JSON string to the array byte buffer, going two bytes at a time.
    const data = new DataView(new ArrayBuffer(1 + 2 + 2 * msg.length));
    let byteIdx = 0;
    data.setUint8(byteIdx, messageType);
    byteIdx++;
    data.setUint16(byteIdx, msg.length, true);
    byteIdx += 2;
    for (const char of msg) {
      // charCodeAt() is UTF-16, codePointAt() is Unicode.
      data.setUint16(byteIdx, char.charCodeAt(0), true);
      byteIdx += 2;
    }
    this.dc.send(data);
    
    return true;
  }


  debug(NodeJS) {
    
    this.ws.send(JSON.stringify({ type: "debug", debug: NodeJS }));
  }
}

customElements.define("peer-stream", PeerStream, { extends: "video" });


export function SendToUE(msg){
  ps.emitMessage(msg);  
}




