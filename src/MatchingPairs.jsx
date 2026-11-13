import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2, Users, User, RefreshCw, CircleArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io('https://portfolioserver-l5sd.onrender.com', {
  autoConnect: false,
  transports: ['websocket']
});

const PLAYER_ID_STORAGE_KEY = 'matching_pairs_player_id';
const BASE_MATCH_POINTS = 100;
const MAX_GRID_DIMENSION = 12;

const ICON_CATALOG = [
  { id: 'laptop', label: 'Laptop', symbol: '💻' },
  { id: 'puzzle', label: 'Puzzle', symbol: '🧩' },
  { id: 'gear', label: 'Gear', symbol: '⚙️' },
  { id: 'palette', label: 'Palette', symbol: '🎨' },
  { id: 'rocket', label: 'Rocket', symbol: '🚀' },
  { id: 'chart', label: 'Chart', symbol: '📊' },
  { id: 'tools', label: 'Tools', symbol: '🛠️' },
  { id: 'idea', label: 'Idea', symbol: '💡' },
  { id: 'folder', label: 'Folder', symbol: '🗂️' },
  { id: 'monitor', label: 'Monitor', symbol: '🖥️' },
  { id: 'globe', label: 'Globe', symbol: '🌐' },
  { id: 'package', label: 'Package', symbol: '📦' }
];

const POWER_UPS = [
  {
    type: 'none',
    name: 'None',
    value: 0,
    description:'No power ups selected.'
  },
  {
    type: 'icon-variety',
    name: 'Less Icons',
    value: -2,
    description: (val) => `Use ${val * -1} fewer distinct icons on your board, with more pairs of each icon.`
  },
  {
    type: 'score-multiplier',
    name: "Point Multiplier",
    value: 1.25,
    description: (val) => `Earn ${val}x the points for every successful match.`
  }
];

const getPlayerID = () => {
  let savedID = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (!savedID) {
    savedID = window.crypto.randomUUID();
    window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, savedID);
  }
  return savedID;
};

const shuffle = (items) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const isValidGrid = (rows, cols) =>
  Number.isInteger(Number(rows)) &&
  Number.isInteger(Number(cols)) &&
  Number(rows) >= 2 &&
  Number(cols) >= 2 &&
  Number(rows) <= MAX_GRID_DIMENSION &&
  Number(cols) <= MAX_GRID_DIMENSION &&
  (Number(rows) * Number(cols)) % 2 === 0;

const getPowerUpFromSnapshot = (powerUp) =>
  POWER_UPS.find((option) => option.type === powerUp?.type) || POWER_UPS[0];

const createDeck = (rows, cols, powerUp) => {
  const totalCards = rows * cols;
  const pairCount = totalCards / 2;
  const baseDistinctCount = Math.min(ICON_CATALOG.length, pairCount);
  const distinctCount = Math.min(
    pairCount,
    Math.max(1, baseDistinctCount + (powerUp.type === 'icon-variety' ? powerUp.value : 0))
  );
  const icons = shuffle(ICON_CATALOG).slice(0, distinctCount);
  const pairsPerIcon = Array.from({ length: distinctCount }, () => 1);

  for (let extraPair = 0; extraPair < pairCount - distinctCount; extraPair += 1) {
    pairsPerIcon[extraPair % distinctCount] += 1;
  }

  return shuffle(icons.flatMap((icon, iconIndex) =>
    Array.from({ length: pairsPerIcon[iconIndex] * 2 }, () => ({
      id: `${icon.id}-${crypto.randomUUID()}`,
      iconID: icon.id,
      iconLabel: icon.label,
      symbol: icon.symbol,
      revealed: false,
      matched: false
    }))
  ));
};

const MatchingPairs = () => {
  const [activeTab, setActiveTab] = useState('singleplayer');
  const [isJoined, setIsJoined] = useState(false);
  const [roomID, setRoomID] = useState('');
  const [nickname, setNickname] = useState('');
  const [playerID] = useState(getPlayerID);
  const [roomData, setRoomData] = useState(null);
  const [rows, setRows] = useState('4');
  const [cols, setCols] = useState('4');
  const [selectedPowerUp, setSelectedPowerUp] = useState(POWER_UPS[0]);
  const [gameStatus, setGameStatus] = useState('Lobby');
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [isResolvingPair, setIsResolvingPair] = useState(false);
  const [showFinalResults, setShowFinalResults] = useState(false);
  const [message, setMessage] = useState('');
  const [showDescription, setShowDescription] = useState(false);

  const boardRef = useRef([]);
  const selectedCardIDsRef = useRef([]);
  const resolvingPairRef = useRef(false);
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const matchedCountRef = useRef(0);
  const finishSentRef = useRef(false);
  const activeGameIDRef = useRef(null);
  const lastStartedGameIDRef = useRef(null);
  const mismatchTimerRef = useRef(null);
  const selectedPowerUpRef = useRef(selectedPowerUp);
  const lastRoomStateRef = useRef(null);
  const gameStatusRef = useRef(gameStatus);

  const hasRoomMembership = Boolean(roomData?.players?.[playerID]);

  useEffect(() => {
    selectedPowerUpRef.current = selectedPowerUp;
  }, [selectedPowerUp]);

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  const applyRoomSnapshot = useCallback((room) => {
    if (!room) return;
    setRoomData(room);

    const ownPlayer = room.players?.[playerID];
    if (room.state === 'Lobby') {
      setRows(String(room.rows));
      setCols(String(room.cols));
      if (ownPlayer?.powerUp) {
        setSelectedPowerUp(getPowerUpFromSnapshot(ownPlayer.powerUp));
      }
      if (lastRoomStateRef.current === 'In Game') {
        setGameStatus('Lobby');
        setShowFinalResults(true);
      } else if (gameStatusRef.current === 'Lobby') {
        setGameStatus('Lobby');
      }
    } else if (room.state === 'In Game') {
      setShowFinalResults(false);
      setGameStatus(ownPlayer?.status === 'Finished' ? 'Finished' : 'In Game');
    }

    lastRoomStateRef.current = room.state;
  }, [playerID]);

  const resetGame = useCallback((gameRows, gameCols, powerUp) => {
    const nextBoard = createDeck(Number(gameRows), Number(gameCols), powerUp);
    boardRef.current = nextBoard;
    selectedCardIDsRef.current = [];
    resolvingPairRef.current = false;
    scoreRef.current = 0;
    missesRef.current = 0;
    matchedCountRef.current = 0;
    finishSentRef.current = false;
    setBoard(nextBoard);
    setIsResolvingPair(false);
    setScore(0);
    setMisses(0);
    setGameStatus('In Game');
  }, []);

  useEffect(() => {
    if (!isJoined || activeTab !== 'multiplayer') return undefined;

    const joinRoom = () => {
      socket.emit('matchingPairs:joinRoom', {
        roomID,
        playerID,
        nickname,
        powerUp: {
          type: selectedPowerUpRef.current.type,
          value: selectedPowerUpRef.current.value
        }
      }, (response) => {
        if (!response?.ok) {
          setMessage(response?.error || 'Could not join this room.');
          setIsJoined(false);
          return;
        }
        applyRoomSnapshot(response.room);
        setMessage('');
      });
    };

    const handleRoomUpdate = (room) => applyRoomSnapshot(room);
    const handleGameStarted = (room) => applyRoomSnapshot(room);
    const handleGameComplete = (room) => {
      applyRoomSnapshot(room);
      setShowFinalResults(true);
      setGameStatus('Lobby');
    };
    const handleError = (error) => setMessage(error?.error || 'A room error occurred.');

    socket.on('connect', joinRoom);
    socket.on('matchingPairs:roomUpdate', handleRoomUpdate);
    socket.on('matchingPairs:gameStarted', handleGameStarted);
    socket.on('matchingPairs:gameComplete', handleGameComplete);
    socket.on('matchingPairs:error', handleError);

    if (socket.connected) joinRoom();
    else socket.connect();

    return () => {
      socket.off('connect', joinRoom);
      socket.off('matchingPairs:roomUpdate', handleRoomUpdate);
      socket.off('matchingPairs:gameStarted', handleGameStarted);
      socket.off('matchingPairs:gameComplete', handleGameComplete);
      socket.off('matchingPairs:error', handleError);

      if (socket.connected) {
        socket.emit('matchingPairs:leaveRoom', { playerID }, () => socket.disconnect());
      } else {
        socket.disconnect();
      }
    };
  }, [activeTab, applyRoomSnapshot, isJoined, nickname, playerID, roomID]);

  useEffect(() => {
    if (!isJoined || activeTab !== 'multiplayer' || roomData?.state !== 'Lobby' || !hasRoomMembership) return;
    if (socket.connected) {
      socket.emit('matchingPairs:updateSettings', {
        roomID,
        playerID,
        rows: Number(rows),
        cols: Number(cols),
        powerUp: {
          type: selectedPowerUp.type,
          value: selectedPowerUp.value
        }
      }, (response) => {
        if (!response?.ok) setMessage(response?.error || 'Could not update room settings.');
        else setMessage('');
      });
    }
  }, [activeTab, cols, hasRoomMembership, isJoined, playerID, roomData?.state, roomID, rows, selectedPowerUp]);

  useEffect(() => {
    if (activeTab !== 'multiplayer' || !isJoined || !roomData || roomData.state !== 'In Game') return;
    const ownPlayer = roomData.players?.[playerID];
    if (!ownPlayer || ownPlayer.status !== 'In Game' || lastStartedGameIDRef.current === roomData.gameId) return;

    lastStartedGameIDRef.current = roomData.gameId;
    activeGameIDRef.current = roomData.gameId;
    setShowFinalResults(false);
    setMessage('');
    resetGame(roomData.rows, roomData.cols, getPowerUpFromSnapshot(ownPlayer.powerUp));
  }, [activeTab, isJoined, playerID, resetGame, roomData]);

  useEffect(() => () => {
    if (mismatchTimerRef.current) window.clearTimeout(mismatchTimerRef.current);
  }, []);

  const finishGame = (finalScore) => {
    if (finishSentRef.current) return;
    finishSentRef.current = true;
    setGameStatus('Finished');

    if (activeTab === 'multiplayer' && isJoined) {
      socket.emit('matchingPairs:finishGame', {
        roomID,
        playerID,
        gameId: activeGameIDRef.current,
        score: finalScore
      }, (response) => {
        if (!response?.ok) setMessage(response?.error || 'Could not submit your final score.');
      });
    }
  };

  const startGame = () => {
    if (!isValidGrid(rows, cols)) {
      setMessage('Choose rows and columns between 2 and 12 with an even total number of cards.');
      return;
    }

    setMessage('');
    setShowFinalResults(false);
    if (activeTab === 'multiplayer' && isJoined) {
      socket.emit('matchingPairs:startGame', { roomID, playerID }, (response) => {
        if (!response?.ok) setMessage(response?.error || 'Could not start the game.');
      });
    } else {
      activeGameIDRef.current = null;
      resetGame(Number(rows), Number(cols), selectedPowerUp);
    }
  };

  const handleCardClick = (cardID) => {
    if (gameStatus !== 'In Game' || resolvingPairRef.current) return;

    const clickedCard = boardRef.current.find((card) => card.id === cardID);
    if (!clickedCard || clickedCard.matched || clickedCard.revealed) return;

    const revealedBoard = boardRef.current.map((card) =>
      card.id === cardID ? { ...card, revealed: true } : card
    );
    boardRef.current = revealedBoard;
    setBoard(revealedBoard);

    const selection = [...selectedCardIDsRef.current, cardID];
    selectedCardIDsRef.current = selection;
    if (selection.length < 2) return;

    const [firstID, secondID] = selection;
    const firstCard = revealedBoard.find((card) => card.id === firstID);
    const secondCard = revealedBoard.find((card) => card.id === secondID);
    resolvingPairRef.current = true;
    setIsResolvingPair(true);

    if (firstCard.iconID === secondCard.iconID) {
      const matchedBoard = revealedBoard.map((card) =>
        card.id === firstID || card.id === secondID ? { ...card, matched: true } : card
      );
      boardRef.current = matchedBoard;
      matchedCountRef.current += 2;
      const multiplier = selectedPowerUp.type === 'score-multiplier' ? selectedPowerUp.value : 1;
      const earnedPoints = Math.max(0, BASE_MATCH_POINTS - missesRef.current) * multiplier;
      const nextScore = scoreRef.current + earnedPoints;
      scoreRef.current = nextScore;
      missesRef.current = 0;
      selectedCardIDsRef.current = [];
      resolvingPairRef.current = false;
      setBoard(matchedBoard);
      setIsResolvingPair(false);
      setScore(nextScore);
      setMisses(0);

      if (matchedCountRef.current === matchedBoard.length) finishGame(nextScore);
      return;
    }

    const nextMisses = missesRef.current + 1;
    missesRef.current = nextMisses;
    setMisses(nextMisses);
    mismatchTimerRef.current = window.setTimeout(() => {
      const hiddenBoard = boardRef.current.map((card) =>
        card.id === firstID || card.id === secondID ? { ...card, revealed: false } : card
      );
      boardRef.current = hiddenBoard;
      selectedCardIDsRef.current = [];
      resolvingPairRef.current = false;
      setBoard(hiddenBoard);
      setIsResolvingPair(false);
      mismatchTimerRef.current = null;
    }, 850);
  };

  const leaveRoom = () => {
    setIsJoined(false);
    setRoomData(null);
    setGameStatus('Lobby');
    setBoard([]);
    setShowFinalResults(false);
    setMessage('');
  };

  const chooseTab = (tab) => {
    if (tab === activeTab) return;
    if (isJoined) leaveRoom();
    setActiveTab(tab);
    setGameStatus('Lobby');
  };

  const handleJoinRoom = (event) => {
    event.preventDefault();
    if (!roomID.trim() || !nickname.trim()) {
      setMessage('Enter a room name and nickname to join.');
      return;
    }
    setMessage('');
    setIsJoined(true);
  };

  const validGrid = isValidGrid(rows, cols);
  const ownPlayer = roomData?.players?.[playerID];
  const scoreboard = Object.entries(roomData?.players || {})
    .sort(([, first], [, second]) => (second.score || 0) - (first.score || 0));
  const isRoomPlaying = activeTab === 'multiplayer' && roomData?.state === 'In Game';

  return (
    <div className="min-h-screen bg-[#09090b] pb-12 text-slate-100">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#09090b]/90 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3 whitespace-nowrap font-semibold tracking-wide text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Code2 size={20} /></span>
            Trevor De Clark
          </Link>
          <div className="flex w-full items-center justify-between gap-3 text-xs sm:w-auto sm:gap-5 sm:text-sm">
            <Link to="/" className="text-slate-400 transition hover:text-white">Portfolio</Link>
            <Link to="/mines" className="text-slate-400 transition hover:text-white">Mines</Link>
            <Link to="/matching-pairs" className="rounded-full bg-white/10 px-3 py-2 text-violet-200">Matching Pairs</Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto mt-8 max-w-2xl rounded-3xl border border-white/10 bg-[#141419] p-5 font-sans text-slate-200 shadow-2xl sm:p-8">

        <div className="mb-6 flex gap-2 border-b border-slate-800">
          <button
            type="button"
            onClick={() => chooseTab('singleplayer')}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-2 text-sm font-bold transition-colors ${
              activeTab === 'singleplayer' ? 'border-violet-400 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User size={16} /> Singleplayer
          </button>
          <button
            type="button"
            onClick={() => chooseTab('multiplayer')}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-2 text-sm font-bold transition-colors ${
              activeTab === 'multiplayer' ? 'border-violet-400 text-violet-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={16} /> Multiplayer
          </button>
        </div>

        <div className="mb-6 text-center">
          <h2 className="flex items-center justify-center gap-2 text-3xl font-semibold text-white">
            <Code2 className="text-violet-300" size={27} /> Matching Pairs
          </h2>
          <p className="mt-1 text-xs text-slate-400">Find matching pairs of development-themed icons.</p>

          {activeTab === 'multiplayer' && isJoined && (
              <div className="text-center mb-6">
                <div className="text-xs font-bold mt-1">
                  <span><strong className='text-violet-400'>Room:</strong> {roomData?.roomID || roomID}</span>
                  <span><strong className='text-violet-400'>&emsp;Player:</strong> {nickname}</span>
                </div>
                <div>
                  <button type="button" onClick={leaveRoom} className="font-bold text-violet-400 hover:text-violet-200">Leave Room</button>
                </div>
              </div>
            )}
        </div>

        {message && (
          <div role="alert" className="mb-4 rounded-xl border border-violet-900 bg-slate-900 px-3 py-2 text-sm text-violet-200">
            {message}
          </div>
        )}

        {activeTab === 'multiplayer' && !isJoined ? (
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div className="text-center">
              <h3 className="font-serif text-lg font-bold text-slate-100">Join a Room</h3>
              <p className="text-xs text-slate-400">Use the same room name as the other players.</p>
            </div>
            <label className="block text-[10px] font-bold uppercase text-slate-400">
              Room name
              <input
                type="text"
                required
                maxLength={64}
                value={roomID}
                onChange={(event) => setRoomID(event.target.value)}
                placeholder="e.g. GAME123"
                className="mt-1 w-full rounded-xl bg-slate-900 p-3 text-center text-sm font-bold normal-case text-slate-200 outline-none focus:ring-2 focus:ring-violet-700"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase text-slate-400">
              Nickname
              <input
                type="text"
                required
                maxLength={32}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="e.g. PlayerOne"
                className="mt-1 w-full rounded-xl bg-slate-900 p-3 text-center text-sm font-bold normal-case text-slate-200 outline-none focus:ring-2 focus:ring-violet-700"
              />
            </label>
            <button type="submit" className="w-full rounded-xl bg-violet-600 py-3 font-bold text-white shadow-md shadow-violet-900 transition hover:bg-violet-400">
              Enter Room
            </button>
          </form>
        ) : (
          <>

            {gameStatus === 'Lobby' && (
              <section className="mb-6 rounded-2xl bg-[#202027]">
                <div className="grid grid-cols-2 gap-3 p-4 flex-wrap items-center justify-between text-sm">
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Rows
                    <input
                      type="number"
                      min="2"
                      max={MAX_GRID_DIMENSION}
                      value={rows}
                      onChange={(event) => setRows(event.target.value)}
                      className="mt-1 w-full rounded-xl bg-slate-900 p-2 text-center text-sm font-bold text-slate-200 outline-none focus:ring-2 focus:ring-violet-700"
                    />
                  </label>
                  <label className="text-[10px] font-bold uppercase text-slate-400">
                    Columns
                    <input
                      type="number"
                      min="2"
                      max={MAX_GRID_DIMENSION}
                      value={cols}
                      onChange={(event) => setCols(event.target.value)}
                      className="mt-1 w-full rounded-xl bg-slate-900 p-2 text-center text-sm font-bold text-slate-200 outline-none focus:ring-2 focus:ring-violet-700"
                    />
                  </label>
                  <div className="col-span-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Equipped power-up
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDescription((prev) => !prev)}
                        className="text-[10px] font-bold uppercase text-violet-400 hover:text-violet-300 transition-colors cursor-pointer outline-none"
                      >
                        {showDescription ? "Hide Description" : "Show Description"}
                      </button>
                    </div>

                    <select
                      value={selectedPowerUp.type}
                      onChange={(event) => setSelectedPowerUp(POWER_UPS.find((option) => option.type === event.target.value) || POWER_UPS[0])}
                      className="mt-1 w-full rounded-xl bg-slate-900 p-2 text-center text-sm font-bold normal-case text-slate-200 outline-none focus:ring-2 focus:ring-violet-700"
                    >
                      {POWER_UPS.map((powerUp) => (
                        <option key={powerUp.type} value={powerUp.type}>{powerUp.name}</option>
                      ))}
                    </select>

                    {showDescription && (
                      <div className="mt-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs normal-case text-slate-300 font-light animate-fadeIn">
                        <span className="font-bold text-violet-400 block mb-0.5">
                          {selectedPowerUp.name}
                        </span>
                        {typeof selectedPowerUp.description === 'function'
                          ? selectedPowerUp.description(selectedPowerUp.value)
                          : selectedPowerUp.description || "No description available."}
                      </div>
                    )}
                  </div>
                                  </div>
                {!validGrid && (
                  <p className="border-t border-slate-800 px-4 py-3 text-xs font-semibold text-violet-300">
                    Matching pairs need an even number of cards. Change a row or column so rows × columns is even.
                  </p>
                )}
              </section>
            )}

            {showFinalResults && (
              <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900 p-3 text-center">
                <p className="font-serif text-lg font-bold text-violet-300">Game complete!</p>
                <p className="text-xs text-slate-300">Everyone is back in the lobby. Start another game whenever you are ready.</p>
              </div>
            )}

            {gameStatus === 'Lobby' && (
              <button
                type="button"
                onClick={startGame}
                disabled={!validGrid || (activeTab === 'multiplayer' && (!isJoined || roomData?.state !== 'Lobby'))}
                className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-bold text-white shadow-md shadow-violet-900 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showFinalResults ? 'Play Again' : 'New Game'} <RefreshCw size={17} />
              </button>
            )}

            {(gameStatus === 'In Game' || gameStatus === 'Finished') && (
              <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-slate-200">Score: <strong className="text-violet-300">{score}</strong></span>
                  <span className="text-xs text-slate-400">Misses since match: {misses}</span>
                  {selectedPowerUp.type === 'score-multiplier' && (
                    <span className="rounded-full bg-[#202027] px-2 py-1 text-xs font-bold text-violet-400">{selectedPowerUp.value}× points</span>
                  )}
                </div>
                <div
                  className="mx-auto grid w-full max-w-xl gap-2"
                  style={{ gridTemplateColumns: `repeat(${Number(cols)}, minmax(0, 1fr))` }}
                >
                  {board.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => handleCardClick(card.id)}
                      disabled={card.matched || gameStatus !== 'In Game' || isResolvingPair}
                      aria-label={card.revealed ? card.iconLabel : 'Hidden card'}
                      className={`aspect-square min-w-0 rounded-lg text-2xl shadow-sm transition-all sm:rounded-xl sm:text-3xl ${
                        card.matched
                          ? 'bg-emerald-100 ring-2 ring-emerald-200'
                          : card.revealed
                            ? 'bg-[#202027] ring-2 ring-violet-900'
                            : 'bg-violet-700 text-transparent hover:bg-violet-600'
                      } disabled:cursor-default`}
                    >
                      {card.revealed ? card.symbol : '?'}
                    </button>
                  ))}
                </div>
                {gameStatus === 'Finished' && (
                  <p className="mt-4 text-center font-serif font-bold text-violet-300">
                    You found every pair! Final score: {score}
                    {isRoomPlaying && <span className="mt-1 block font-sans text-xs font-normal text-slate-400">Waiting for the other players to finish…</span>}
                  </p>
                )}
                {gameStatus === 'Finished' && activeTab === 'singleplayer' && (
                  <button
                    type="button"
                    onClick={() => setGameStatus('Lobby')}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 font-bold text-white transition hover:bg-violet-400"
                  >
                    <CircleArrowLeft size={17} /> Return to Lobby
                  </button>
                )}
              </section>
            )}

            {activeTab === 'multiplayer' && isJoined && (
              <section className="rounded-xl border border-white/10 bg-[#111116] p-4 text-xs">
                <h3 className="mb-3 flex items-center justify-between border-b border-white/10 pb-2 font-bold uppercase tracking-wider text-slate-200">
                  <span className="flex items-center gap-2"><Sparkles size={14} className="text-violet-600" /> Room Leaderboard</span>
                  <span className="font-normal normal-case text-slate-400">{scoreboard.length} player{scoreboard.length === 1 ? '' : 's'}</span>
                </h3>
                <div className="space-y-2">
                  {scoreboard.map(([id, player], index) => (
                    <div key={id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#202027] p-2.5">
                      <span className="font-semibold text-slate-200">
                        {index + 1}. {player.nickname || 'Player'} {id === playerID && <span className="text-slate-400">(you)</span>}
                      </span>
                      <span className="text-right">
                        <strong className="text-violet-300">{player.score || 0} pts</strong>
                        <span className="ml-2 text-slate-400">{player.status}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {ownPlayer && (
                  <p className="mt-3 text-slate-400">Your power-up: {getPowerUpFromSnapshot(ownPlayer.powerUp).name}</p>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MatchingPairs;
