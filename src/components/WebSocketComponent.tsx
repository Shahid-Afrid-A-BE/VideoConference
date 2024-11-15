import React, {useState,useEffect,useRef} from 'react';

const WebSocketComponent: React.FC = () => {
    const [messages,setMessages] = useState<string[]>([]);
    const [input,setInput] = useState('');
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [peerConnection,setPeerConnection] = useState<RTCPeerConnection | null>(null);
    const [webSocket,setWebSocket] = useState<WebSocket | null>(null);

    

    useEffect(() => {

        //init websocket connection
        const ws = new WebSocket('ws://localhost:8090/ws');
        setWebSocket(ws);

        //handle websocket open event
        ws.onopen = () => {
            console.log('connected to websocket server');
        };

        //handle incoming messages from server
        ws.onmessage = (messageEvent) => {
            //signalling message from server
            console.log("Received raw message:", messageEvent.data);
            const data = JSON.parse(messageEvent.data); //only JSON data can be received
            console.log("Received JSON data:", data);
            handleSignallingMessage(data);
        };

        //handle websocket disconnection event
        ws.onclose = () => {
            console.log("websocket connection ended");
        };

        return () => {
            ws.close();
        };

    },[]);



    const handleSignallingMessage = async (data: any) => {
        console.log("Received signaling message with type:", data.type);

        let pc = peerConnection; //peerConnection value is from useState()
    
        // If peerConnection is null and an offer is received, initialize it
        if (!peerConnection && data.type === "offer") {
            console.log("peerconnection not initialed but offer signal received");
            pc = await initializePeerConnection();
        }
        console.log(" beu=yound w=switch .....");
        switch (data.type) {
            case "offer":
                if (!pc) 
                {
                    console.log("offer ! peer....");
                    return;
                }
                console.log("Setting remote offer...");
    
                // Set the remote description and create an answer
                if (!data.offer || !data.offer.sdp || data.offer.type !== "offer") {
                    console.error("Invalid offer received:", data.offer);
                    return;
                }
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                webSocket?.send(JSON.stringify({ type: "answer", answer }));
                break;
    
            case "answer":
                if (!pc) return;
                console.log("Setting remote answer...");
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                break;
    
            case "candidate":
                if (!pc){
                    console.log("received candidate signal but.... peerc !");
                    return;
                }
                console.log("Adding ICE candidate...");
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                break;
    
            default:
                break;
        }
    };
    
    // Initialize peer connection with common setup for both clients
    const initializePeerConnection = async (): Promise<RTCPeerConnection | null> => {  //Promise<RTCPeerConnection | null>  : return type of this function (pc or null)
        console.log("entered in init peer connection function");
        try{
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.ideasip.com" }],
              });
        console.log("WC peer ggogle setup");
        console.log("RTCPeerConnection instance value......:", pc);
        pc.onicegatheringstatechange = () => {
            console.log("ICE Gathering State:", pc.iceGatheringState);
        };

        //send ICE data to websocket(and ws send to another client, ICE cntaind IP address and all other data for Peer connection)
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                webSocket?.send(
                    JSON.stringify({
                        type: "candidate",
                        candidate: event.candidate,
                    })
                );
            }
            console.log("ICE candidate sent");
        };
       
        
        //Receives remote video and audio streams from the other client and displays them on the webpage.
        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                console.log("Received remote track");
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };
    
        setPeerConnection(pc);
        return pc;
    }
    catch(error)
    {
        console.log("error occured at try catch : ",error);
        return null;
    }
    };
    
    // Start call function for initiating client
    const startCall = async () => {
        if (!peerConnection) {
            await initializePeerConnection();
        }
    
        try {
            // Access the user's camera and mic
            console.log("Accessing local media...");
            const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            if (localStream.getTracks().length === 0) {
                console.error("No media tracks found in localStream.");
                return;
            }
    
            // Check if each track is added successfully
            localStream.getTracks().forEach((track) => {
                peerConnection?.addTrack(track, localStream);
                console.log("Track added:", track);
            });
    
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
            }
    
            // Wait for the ICE candidate gathering to complete (optional)
            console.log("Waiting for ICE candidate gathering to complete...");
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(reject, 10000000, 'ICE gathering timeout');
                if (peerConnection) {
                    peerConnection.onicegatheringstatechange = () => {
                        console.log("ICE Gathering State:", peerConnection.iceGatheringState);
                        if (peerConnection.iceGatheringState === 'complete') {
                            clearTimeout(timeout);
                            resolve(null);
                        }
                    };
                }
            });
    
            // Generate the offer
            console.log("Creating offer...");
            const offer = await peerConnection?.createOffer();
            console.log("Offer created:", offer);
    
            // Check if the offer contains SDP
            if (offer && offer.sdp) {
                console.log("Generated Offer with SDP:", offer);
                await peerConnection?.setLocalDescription(offer);
                webSocket?.send(JSON.stringify({ type: "offer", offer }));
                console.log("Offer sent:", JSON.stringify({ type: "offer", offer }));
            } else {
                console.error("Offer generation failed or returned invalid offer (missing SDP):", offer);
            }
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







    //function to send a message to websocket server
   /* const sendMessage = () => {
        if(ws.current && input.trim())
        {
            ws.current.send(input);
            setInput('');
        }
    }; */

    