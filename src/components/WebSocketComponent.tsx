import React, { useState, useEffect, useRef } from 'react';

const WebSocketComponent: React.FC = () => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const [candidateQueue, setCandidateQueue] = useState<RTCIceCandidateInit[]>([]);

    useEffect(() => {
        // Initialize WebSocket
        const ws = new WebSocket('ws://localhost:8090/ws');
        webSocketRef.current = ws;

        ws.onopen = () => console.log("Connected to WebSocket server");

        ws.onmessage = async (messageEvent) => {
            const data = JSON.parse(messageEvent.data);
            console.log("Received signaling message:", data);
            await handleSignalingMessage(data);
        };

        ws.onclose = () => console.log("WebSocket connection closed");

        return () => ws.close();
    }, []);

    const sendMessage = (message: object) => {
        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));
            console.log("Sent signaling message:", message);
        }
    };

    const initializePeerConnection = (): RTCPeerConnection => {
        if (peerConnectionRef.current) return peerConnectionRef.current;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendMessage({ type: "candidate", candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const handleSignalingMessage = async (data: any) => {
        const pc = initializePeerConnection();

        switch (data.type) {
            case "offer":
                console.log("Received offer");
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendMessage({ type: "answer", answer });
                break;

            case "answer":
                console.log("Received answer");
                if (pc.signalingState === "have-local-offer") {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                } else {
                    console.error("Invalid state for setting remote answer");
                }
                break;

            case "candidate":
                console.log("Received ICE candidate");
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    console.log("Remote description not set yet. Queueing candidate.");
                    setCandidateQueue((prev) => [...prev, data.candidate]);
                }
                break;

            default:
                console.log("Unknown signaling message type:", data.type);
        }
    };

    const processCandidateQueue = async (pc: RTCPeerConnection) => {
        console.log("Processing queued candidates");
        for (const candidate of candidateQueue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        setCandidateQueue([]);
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

            pc.oniceconnectionstatechange = async () => {
                if (pc.iceConnectionState === "connected") {
                    await processCandidateQueue(pc);
                }
            };
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
