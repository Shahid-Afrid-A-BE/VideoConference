import React, { useEffect, useRef } from 'react';

const WebSocketComponent: React.FC = () => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);           //queue that stores the received ICE candidate until the remote description is set

    useEffect(() => {
        // Initialize WebSocket connection with frontend client
        const ws = new WebSocket('ws://localhost:8090/ws');
        webSocketRef.current = ws;

        //triggered when ws connected
        ws.onopen = () => console.log("Connected to WebSocket server");

        //triggered when signalling message received from signalling server to client(backend code)
        ws.onmessage = async (messageEvent) => {
            const data = JSON.parse(messageEvent.data);
            console.log("Signaling message received:", data);
            await handleSignalingMessage(data);                     //handles the signal message
        };

        //triggered when websocket connection closed    
        ws.onclose = () => console.log("WebSocket connection closed");

        return () => ws.close();
    }, []);

    //@fn : send message to websocket
    const sendMessage = (message: object) => {
        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));
            console.log("Signaling message sent:", message);
        } else {
            console.error("WebSocket not open. Message not sent:", message);
        }
    };

    //@fn : Establish Peer connection
    const initializePeerConnection = (): RTCPeerConnection => {
        if (peerConnectionRef.current) return peerConnectionRef.current;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        //@event : send ICE candidate to websocket
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Sending ICE candidate:", event.candidate);
                sendMessage({ type: "candidate", candidate: event.candidate });
            } else {
                console.log("All ICE candidates sent");
            }
        };

        //@event : set the remote video in <video> element
        pc.ontrack = (event) => {
            
            console.log("Received remote track:", event.streams[0]);
            
            // Check if we have video tracks
            if (event.streams[0]) 
            {
             const videoTracks = event.streams[0].getVideoTracks();
                if (videoTracks.length > 0) {
                    console.log("Remote video track found.");
                    if (remoteVideoRef.current) { //if remoteVideoRef is et to DOM <element>
                        remoteVideoRef.current.srcObject = event.streams[0];    //display video in DOM vide element referenced by remoteVideoRef
                    }
                } else {
                    console.error("No video track found in the remote stream.");
                }
            } else {
                console.error("No streams found on the remote track.");
            }
        };

        //@event : triggered if the state of ice connection changed (connected,.....)
        pc.oniceconnectionstatechange = async () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === "connected") {
                console.log("Processing queued ICE candidates");
                
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    //@fn : process the ICE candidate waiting in the queue(wait until remote description is set)
    const processCandidateQueue = async (pc: RTCPeerConnection) => {
        console.log("Processing queued candidates");
        while (candidateQueueRef.current.length > 0) {
            const candidate = candidateQueueRef.current.shift();
            if (candidate) {
                console.log("Adding queued candidate:", candidate);
                await pc.addIceCandidate(new RTCIceCandidate(candidate));   //add candidate to RTC peer connection
            }
        }
    };

    //@fn : handles the client's incoming singnaling messages from webscoket(offer,candidate,answer)
    const handleSignalingMessage = async (data: any) => {
        const pc = initializePeerConnection();

        switch (data.type) {
        case "offer":
            console.log("Received offer");
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                console.log("Remote description set for offer");
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendMessage({ type: "answer", answer });

                // Process queued candidates after setting remote description
                await processCandidateQueue(pc);
            } catch (error) {
                console.error("Error setting remote description for offer:", error);
            }
            break;

        case "answer":
            console.log("Received answer");
            try {
                if (pc.signalingState === "have-local-offer") {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log("Remote description set for answer");

                    // Process queued candidates
                    await processCandidateQueue(pc);
                } else {
                    console.error("Invalid state for setting remote answer");
                }
            } catch (error) {
                console.error("Error setting remote description for answer:", error);
            }
            break;

        case "candidate":
            console.log("Received ICE candidate");
            if (pc.remoteDescription) {
                try {
                    console.log("Adding ICE candidate directly:", data.candidate);
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
            } else {
                console.log("Remote description not set yet. Queueing candidate.");
                candidateQueueRef.current.push(data.candidate);
            }
            break;

        default:
            console.log("Unknown signaling message type:", data.type);
        }
    };

    //@fn : intiate video call
    const startCall = async () => {
        const pc = initializePeerConnection();

        try {
            
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });    //get local device video and audio
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));                    //add the media(video and audio) to peer connection

            // Attach local stream to local video element
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendMessage({ type: "offer", offer });
        } catch (error) {
            console.error("Error during call initialization:", error);
        }
    };

    return (
        <div>
            <video ref={localVideoRef} autoPlay muted style={{ width: "300px",border: "2px solid black",borderRadius: "10px" }} />
            <video ref={remoteVideoRef} autoPlay style={{ width: "300px",border: "2px solid black",borderRadius: "10px" }} />
            <button onClick={startCall}>Start Call</button>
        </div>
    );
};

export default WebSocketComponent;
