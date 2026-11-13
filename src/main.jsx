import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css' // Ensure this exists for your Tailwind or custom CSS
import Timeline from './Timeline.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Mines from './Mines.jsx';
import MatchingPairs from './MatchingPairs.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Timeline />} />
        <Route path="/mines" element={<Mines />} />
        <Route path="/matching-pairs" element={<MatchingPairs />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>,
)



export default App;
