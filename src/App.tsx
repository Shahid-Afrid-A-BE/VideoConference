import React from 'react';
import WebSocketComponent  from './components/WebSocketComponent';

function App(){
  return(
    <div className="App">
      <h1>WebSocket Client</h1>
      <WebSocketComponent/>  {/*user defined componet*/}
    </div>
  );
};
export default App;