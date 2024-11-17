import React, { useEffect, useRef } from 'react';

const WebSocketComponent: React.FC = () => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
    const hasSentIceCandidateRef = useRef<boolean>(false); // Flag to track if an ICE candidate has been sent

    useEffect(() => {
        // Step 1: Establish WebSocket Connection
        const ws = new WebSocket('ws://localhost:8090/ws');
        webSocketRef.current = ws;

        ws.onopen = () => console.log("Step 1: WebSocket connection established.");
        ws.onmessage = async (messageEvent) => {
            console.log("Step 2: Signaling message received:", JSON.parse(messageEvent.data));
            await handleSignalingMessage(JSON.parse(messageEvent.data));
        };
        ws.onclose = () => console.log("WebSocket connection closed.");

        return () => ws.close();
    }, []);

    const sendMessage = (message: object) => {
        if (webSocketRef.current?.readyState === WebSocket.OPEN) {
            webSocketRef.current.send(JSON.stringify(message));
            console.log("Step 5: Signaling message sent:", message);
        } else {
            console.error("WebSocket not open. Message not sent:", message);
        }
    };

    const initializePeerConnection = (): RTCPeerConnection => {
        if (peerConnectionRef.current) {
            return peerConnectionRef.current;
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        console.log("step 2 : peer connection initialized");

        pc.onicecandidate = (event) => {
            if (event.candidate && !hasSentIceCandidateRef.current) {
                console.log("Step 6: ICE candidate gathered and sent:", event.candidate);
                sendMessage({ type: "candidate", candidate: event.candidate });
                hasSentIceCandidateRef.current = true; // Set the flag after sending the first ICE candidate
            } else if (!event.candidate) {
                console.log("All ICE candidates have been gathered.");
            }
        };

        pc.ontrack = (event) => {
            console.log("Step 7: Remote video track received.");
            if (event.streams[0]) {
                console.log("Step 7.1: Setting remote video track.");
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State changed:", pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const processCandidateQueue = async (pc: RTCPeerConnection) => {
        console.log("Step 6.1: Processing queued ICE candidates...");
        if (candidateQueueRef.current.length > 0) {
            // Only process the last candidate in the queue
            const lastCandidate = candidateQueueRef.current.pop();
            if (lastCandidate) {
                console.log("Adding the last ICE candidate:", lastCandidate);
                await pc.addIceCandidate(new RTCIceCandidate(lastCandidate));
            }
        }
    };

    const handleSignalingMessage = async (data: any) => {
        const pc = initializePeerConnection();

        switch (data.type) {
            case "offer":
                console.log("Step 3: Offer received from signaling server.");
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    console.log("Step 3.1: Remote description set for offer.");

                    // Access local media (audio and video)
                    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = localStream;
                        console.log("Step 3.2: Local media stream set to local video element.");
                    }

                    // Create and send answer
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    console.log("Step 3.3: Answer created and sent.");
                    sendMessage({ type: "answer", answer });

                    await processCandidateQueue(pc);
                } catch (error) {
                    console.error("Error handling offer:", error);
                }
                break;

            case "answer":
                console.log("Step 4: Answer received from signaling server.");
                try {
                    if (pc.signalingState === "have-local-offer") {
                        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                        console.log("Step 4.1: Remote description set for answer.");
                        await processCandidateQueue(pc);
                    } else {
                        console.error("Invalid state for setting remote answer.");
                    }
                } catch (error) {
                    console.error("Error handling answer:", error);
                }
                break;

            case "candidate":
                console.log("Step 6.2: ICE candidate received.");
                if (pc.remoteDescription) {
                    try {
                        console.log("Adding ICE candidate to peer connection.");
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
            console.log("Step 2: Starting call. Accessing local media...");
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
                console.log("Step 2.1: Local media stream set to local video element.");
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log("Step 2.2: Offer created and sent.");
            sendMessage({ type: "offer", offer });
        } catch (error) {
            console.error("Error during call initialization:", error);
        }
    };

    return (
        <div>
            <video ref={localVideoRef} autoPlay muted style={{ width: "300px", border: "2px solid black", borderRadius: "10px" }} />
            <video ref={remoteVideoRef} autoPlay style={{ width: "300px", border: "2px solid black", borderRadius: "10px" }} />
            <button onClick={startCall}>Start Call</button>
        </div>
    );
};

export default WebSocketComponent;
