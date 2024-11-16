import React, { useEffect, useRef } from 'react';

const WebSocketComponent: React.FC = () => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]); // Replacing useState

    useEffect(() => {
        // Initialize WebSocket
        const ws = new WebSocket('ws://localhost:8090/ws');
        webSocketRef.current = ws;

        ws.onopen = () => console.log("Connected to WebSocket server");

        ws.onmessage = async (messageEvent) => {
            const data = JSON.parse(messageEvent.data);
            console.log("Signaling message received:", data);
            await handleSignalingMessage(data);
        };

        ws.onclose = () => console.log("WebSocket connection closed");

        return () => ws.close();
    }, []);

    const sendMessage = (message: object) => {
        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));
            console.log("Signaling message sent:", message);
        } else {
            console.error("WebSocket not open. Message not sent:", message);
        }
    };

    const initializePeerConnection = (): RTCPeerConnection => {
        if (peerConnectionRef.current) return peerConnectionRef.current;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Sending ICE candidate:", event.candidate);
                sendMessage({ type: "candidate", candidate: event.candidate });
            } else {
                console.log("All ICE candidates sent");
            }
        };

        pc.ontrack = (event) => {
            console.log("Received remote track:", event.streams[0]);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        pc.oniceconnectionstatechange = async () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === "connected") {
                console.log("Processing queued ICE candidates");
                await processCandidateQueue(pc);
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const processCandidateQueue = async (pc: RTCPeerConnection) => {
        console.log("Processing queued candidates");
        while (candidateQueueRef.current.length > 0) {
            const candidate = candidateQueueRef.current.shift();
            if (candidate) {
                console.log("Adding queued candidate:", candidate);
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        }
    };

    const handleSignalingMessage = async (data: any) => {
        const pc = initializePeerConnection();

        switch (data.type) {
        case "offer":
            console.log("Received offer");
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                console.log("Remote description set for offer");
                console.log("Remote description set for offer:", pc.remoteDescription);
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
                    console.log("Remote description set for offer:", pc.remoteDescription);

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

    const startCall = async () => {
        const pc = initializePeerConnection();

        try {
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
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
            <video ref={localVideoRef} autoPlay muted style={{ width: "300px" }} />
            <video ref={remoteVideoRef} autoPlay style={{ width: "300px" }} />
            <button onClick={startCall}>Start Call</button>
        </div>
    );
};

export default WebSocketComponent;
