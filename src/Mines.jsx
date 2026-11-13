import { useState, useEffect, useRef } from 'react';
import useSound from 'use-sound';
import mineSfx from './assets/384113__microsoftsam__bang01.wav';
import safeSfx from './assets/523425__andersmmg__ding-2.wav';
import nukeSfx from './assets/587190__derplayer__explosion_04.wav';
import giftSfx from './assets/620668__s11it0__happy-coin.wav';
import shieldSfx from './assets/418194__deleted_user_3656686__hard-glass-impact.wav';
import victorySfx from './assets/619832__cogfirestudios__puzzle-game-victory-melody.wav';
import { 
  Bomb, RefreshCw, Gift, Code2, Bug, Gem, Egg, EggFried,
  Smile, Frown, Bone, ShieldPlus, FireExtinguisher, Flame, Ham, 
  CircleArrowLeft, ArrowRight, Users, User, Radiation, IceCreamCone,
  ShieldCheck, TriangleAlert, Cake
} from 'lucide-react';
import { Link } from 'react-router-dom';
import io from 'socket.io-client';

// Socket instance initialized outside component to prevent multiple connections on re-render
const socket = io('https://amie-server-mdhz.onrender.com', {
  autoConnect: false,
  transports: ['websocket']
});

// Power-up active counters for execution
let shieldCount = 1;
let pickaxeTriggerChance = 0;
let minesLocatable = 0;
let giftCount = 0;

const Mines = () => {

  const [playMine] = useSound(mineSfx);
  const [playGift] = useSound(giftSfx);
  const [playSafe] = useSound(safeSfx);
  const [playNuke] = useSound(nukeSfx);
  const [playShield] = useSound(shieldSfx);
  const [playVictory] = useSound(victorySfx);
  
  // Navigation & Mode State
  const [activeTab, setActiveTab] = useState('singleplayer'); // 'singleplayer' | 'multiplayer'
  const [isJoined, setIsJoined] = useState(false);

  // Power-Up Lists
  const minRowCol = 2;
  const powerUps = [
    { 
      type: "Shield", 
      value: 1, 
      description: (val) => `Protects you from blowing up on your first ${val === 1 ? "mine hit" : `${val} mines hit`}. Shields cannot protect you from a nuke!` 
    },
    { 
      type: "Pickaxe", 
      value: 1, 
      description: (val) => `Gives a ${val * 100}% chance to automatically reveal an extra safe tile on click. extra tiles are worth ${pickaxeScore}x the points of normal tiles` 
    },
    { 
      type: "Mine Locator", 
      value: 1, 
      description: (val) => `Reveals the location of ${val === 1 ? `${val} mine` : `${val} mines`} on your board at game start.` 
    },
    { 
      type: "Gift", 
      value: 1, 
      description: (val) => `Places ${val === 1 ? `${val} tile` : `${val} tiles`} on the board that award ${giftMultiplier}x the points when clicked.` 
    },
    { 
      type: "None", 
      value: 0, 
      description: () => "No special power-up equipped." 
    }
  ];

  const multiplayerPowerUps = [
    { 
      type: "Extra Mines", 
      value: 2, 
      description: (val) => `Adds ${val === 1 ? `an extra mine` : `${val} extra mines`} to all opponents' boards.` 
    },
    { 
      type: "Shield", 
      value: 1, 
      description: (val) => `Protects you from blowing up on your first ${val === 1 ? "mine hit" : `${val} mines hit`}. Shields cannot protect you from a nuke!` 
    },
    { 
      type: "Pickaxe", 
      value: 1, 
      description: (val) => `Gives a ${val * 100}% chance to automatically reveal an extra safe tile on click. extra tiles are worth ${pickaxeScore}x the points of normal tiles` 
    },
    { 
      type: "Mine Locator", 
      value: 2, 
      description: (val) => `Reveals the location of ${val === 1 ? `${val} mine` : `${val} mines`} on your board at game start.` 
    },
    { 
      type: "Gift", 
      value: 2, 
      description: (val) => `Places ${val === 1 ? `${val} tile` : `${val} tiles`} on the board that award ${giftMultiplier}x the points when clicked.` 
    },
    { 
      type: "Nuke", 
      value: 1, 
      description: (val) => `Adds ${val === 1 ? `a nuke tile` : `${val} nuke tiles`} to all opponents' boards that makes them get zero points that round if detonated. Shields cannot protect against a nuke.` 
    },
    { 
      type: "None", 
      value: 0, 
      description: () => "No special power-up equipped." 
    }
  ];
  const giftMultiplier = 10;
  const pickaxeScore = 1.1;

  // Board Icons & Game State
  const [SafeIcon, setSafeIcon] = useState(() => Gem);
  const [BombIcon, setBombIcon] = useState(() => Bomb);
  const [NukeIcon, setNukeIcon] = useState(() => Radiation);
  const [GiftIcon, setGiftIcon] = useState(() => Gift);
  const [ShieldIcon, setShieldIcon] = useState(() => ShieldPlus);
  const [gameStatus, setGameStatus] = useState("Lobby");
  const [points, setPoints] = useState(0);
  const roundStartPointsRef = useRef(0);
  const [clicks, setClicks] = useState(0);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [minesCount, setMinesCount] = useState(4);
  const [nukeCount, setNukeCount] = useState(0);
  const [roundsCount, setRoundsCount] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [selectedPowerUp, setSelectedPowerUp] = useState({ type: "None", value: 0 });
  const [showDescription, setShowDescription] = useState(false);

  // Multiplayer States
  const [RoomID, setRoomID] = useState("");
  const [nickname, setNickname] = useState("");
  const [playersList, setPlayersList] = useState({});
  const [roomMessage, setRoomMessage] = useState("");

  // Persistent Player ID
  const [playerID] = useState(() => {
    let saved = localStorage.getItem('mines_player_id');
    if (!saved) {
      saved = crypto.randomUUID();
      localStorage.setItem('mines_player_id', saved);
    }
    return saved;
  });

  // Default Initial Board Layout
  const [board, setBoard] = useState([
    [
      { row: 0, col: 0, isMine: false, isGift: false, isNuke: false, isShield: false, visible: true },
      { row: 0, col: 1, isMine: false, isGift: false, isNuke: false, isShield: false, visible: true },
    ],
    [
      { row: 1, col: 0, isMine: false, isGift: false, isNuke: false, isShield: false, visible: true },
      { row: 1, col: 1, isMine: true, isGift: false, isNuke: false, isShield: false, visible: true },
    ]
  ]);

  // Socket Lifecycle Management
  useEffect(() => {
    if (!isJoined || activeTab !== 'multiplayer') return;

    socket.connect();

    socket.emit('joinGame', {
      roomID: RoomID,
      playerID: playerID,
      nickname: nickname,
      status: gameStatus,
      selectedPowerUp: selectedPowerUp
    });

    socket.on('room_settings_update', (roomData) => {
      setPlayersList(roomData.players || {});
      setRoundsCount(roomData.rounds);

      const myData = roomData.players?.[playerID];
      if (myData && roomData.state === "Lobby") {
        if (myData.rows) setRows(myData.rows);
        if (myData.cols) setCols(myData.cols);
        if (myData.mines) setMinesCount(myData.mines);
        if (myData.nukes !== undefined) setNukeCount(myData.nukes);
      }
    });

    socket.on('room_status_update', (roomData) => {
      setPlayersList(roomData.players || {});
      setRoundsCount(roomData.rounds);
    });

    socket.on('start_game', ({ room }) => {
      const myData = room.players[playerID];
      setPlayersList(room.players || {});
      setPoints(0);
      roundStartPointsRef.current = 0;
      if (myData) {
        setRows(myData.rows);
        setCols(myData.cols);
        setMinesCount(myData.mines);
        setNukeCount(myData.nukes);
        if (myData.powerUp) {
          setSelectedPowerUp(myData.powerUp);
        }
      }
      handleStartNewGame(myData);
    });

    socket.on('round_over', (room) => {
      setPlayersList(room.players || {});
    });

    return () => {
      if (socket.connected) {
        socket.emit('leaveGameRoom', { roomID: RoomID, playerID: playerID }, () => socket.disconnect());
      } else {
        socket.disconnect();
      }
      socket.off('room_status_update');
      socket.off('start_game');
      socket.off('round_over');
    };
  }, [isJoined, activeTab, RoomID, playerID, nickname]);

  // Sync settings whenever inputs or powerup choices change in multiplayer lobby
  useEffect(() => {
    if (isJoined && activeTab === 'multiplayer' && RoomID) {
      resetPowerUpUsages();

      socket.emit('changeSettings', {
        roomID: RoomID,
        rows: rows,
        cols: cols,
        mines: minesCount,
        rounds: roundsCount,
        selectedPowerUp: selectedPowerUp,
        playerID: playerID
      });
    }
  }, [rows, cols, minesCount, roundsCount, selectedPowerUp, isJoined, activeTab, RoomID]);

  // Sync selection between tabs
  useEffect(() => {
    const currentList = activeTab === "multiplayer" ? multiplayerPowerUps : powerUps;
    const match = currentList.find((p) => p.type === selectedPowerUp.type);

    if (match) {
      setSelectedPowerUp(match);
      resetPowerUpUsages();
    } else {
      setSelectedPowerUp({ type: "None", value: 0 });
    }
  }, [activeTab]);

  const revealBoard = () => {
    for (const i of board) {
      for (const j of i) {
        j.visible = true;
      }
    }
  };

  const resetPowerUpUsages = (settings = null) => {
    const currentList = activeTab === "multiplayer" ? multiplayerPowerUps : powerUps;
    const activePowerUp = settings?.powerUp ?? selectedPowerUp;
    const match = currentList.find((p) => p.type === activePowerUp.type) || activePowerUp;

    shieldCount = match.type === "Shield" ? match.value : 0;
    pickaxeTriggerChance = match.type === "Pickaxe" ? match.value : 0;
    minesLocatable = match.type === "Mine Locator" ? match.value : 0;
    giftCount = match.type === "Gift" ? match.value : 0;
  };

  const handleStartNewGame = (settings = null) => {
    // 1. Explicit Fallback Parameters (Prevents NaN)
    const targetRows = settings?.rows !== undefined ? settings.rows : rows;
    const targetCols = settings?.cols !== undefined ? settings.cols : cols;
    const targetMines = settings?.mines !== undefined ? settings.mines - (settings?.powerUp.type === "Extra Mines" ? settings.powerUp.value : 0) : minesCount;
    const targetNukes = settings?.nukes !== undefined ? settings.nukes - (settings?.powerUp.type === "Nuke" ? settings.powerUp.value : 0) : nukeCount;
    const targetRounds = settings?.rounds !== undefined ? settings.rounds : roundsCount;

    setNukeCount(targetNukes);

    const sanitizeData = (data, min) => {
      data = Number(data);
      return isNaN(data) || data < min ? min : Math.floor(data);
    };
    
    const createCell = (r, c) => ({
      row: r,
      col: c,
      isMine: false,
      isGift: false,
      isNuke: false,
      isShield: false,
      visible: false,
    });

    const randomizeBoard = (boardArr, rCount, cCount, mCount, nCount) => {
      let len = rCount * cCount;
      let listOfVals = Array.from({ length: len }, (_, index) => index);
      
      // Place Mines & Nukes
      for (let i = 0; i < mCount + nCount; i++) {
        if (len <= 0) break;
        let index = Math.floor(Math.random() * len);
        let number = listOfVals[index];

        let r = Math.floor(number / cCount);
        let c = Math.floor(number % cCount);

        if (i < nCount) {
          boardArr[r][c].isNuke = true;
        } else {
          if ((i - nCount) < minesLocatable) {
            boardArr[r][c].visible = true;
          }
          boardArr[r][c].isMine = true;
        }

        listOfVals.splice(index, 1);
        len--;
      }

      // Place Gifts
      let availableSpace = len;
      for (let i = 0; i < Math.min(giftCount, availableSpace); i++) {
        let index = Math.floor(Math.random() * len);
        let number = listOfVals[index];

        let r = Math.floor(number / cCount);
        let c = Math.floor(number % cCount);

        boardArr[r][c].isGift = true;

        listOfVals.splice(index, 1);
        len--;
      }
    };

    const randomizeIcons = () => {
      let randomNum = Math.floor(Math.random() * 101);
      if (randomNum < 50) {
        if (randomNum < 25) {
          setSafeIcon(() => Code2);
          setBombIcon(() => Bug);
          if(randomNum === 0){
            setGiftIcon(() => Cake)
          }
        } else {
          setSafeIcon(() => Gem);
          setBombIcon(() => Bomb);
          if(randomNum === 32){
            setGiftIcon(() => IceCreamCone)
          }
        }
      } else {
        if (randomNum < 76) {
          if (randomNum > 50) {
            setSafeIcon(() => Smile);
            setBombIcon(() => Frown);
            if(randomNum === 75){
              setNukeIcon(() => TriangleAlert)
            }
          } else {
            setSafeIcon(() => FireExtinguisher);
            setBombIcon(() => Flame);
          }
        } else {
          if (randomNum === 100) {
            setSafeIcon(() => Egg);
            setBombIcon(() => EggFried);
          } else {
            setSafeIcon(() => Ham);
            setBombIcon(() => Bone);
            if(randomNum === 78){
              setShieldIcon(() => ShieldCheck);
            }
          }
        }
      }
    };

    if (gameStatus === "Lobby") {
      setPoints(0);
      roundStartPointsRef.current = 0;
      setCurrentRound(1);
      setGameStatus("In Game");
      socket.emit('statusUpdate', { roomID: RoomID, playerID: playerID, status: "In Game" });
    } else {
      roundStartPointsRef.current = points;
      if (targetRounds > 0 && currentRound >= targetRounds) {
        setGameStatus("Lobby");
        socket.emit('statusUpdate', { roomID: RoomID, playerID: playerID, status: "Lobby" });
      } else {
        setCurrentRound((prev) => prev + 1);
        setGameStatus("In Game");
        socket.emit('statusUpdate', { roomID: RoomID, playerID: playerID, status: "In Game" });
      }
    }

    setClicks(0);
    setRoundsCount(Number(targetRounds));

    resetPowerUpUsages(settings);

    let validRows = sanitizeData(targetRows, minRowCol);
    setRows(validRows);
    let validCols = sanitizeData(targetCols, minRowCol);
    setCols(validCols);

    const minMines = Math.floor(Math.sqrt(validRows * validCols - 1));
    let validMinesCount = sanitizeData(targetMines, minMines);

    if (validMinesCount >= (validRows * validCols - targetNukes)) {
      validMinesCount = Math.max(1, validRows * validCols - targetNukes - 1);
    }
    setMinesCount(validMinesCount);

    let tempBoard = [];
    for (let i = 0; i < validRows; i++) {
      let row = [];
      for (let j = 0; j < validCols; j++) {
        row.push(createCell(i, j));
      }
      tempBoard.push(row);
    }

    randomizeIcons();
    randomizeBoard(tempBoard, validRows, validCols, validMinesCount, targetNukes);

    setBoard(tempBoard);
  };

  const handleCellClick = (rowIndex, colIndex, isUserClick = true) => {

    const handleMine = () => {
      if (shieldCount > 0) {
        playShield();
        shieldCount -= 1;
        board[rowIndex][colIndex].isShield = true;
        board[rowIndex][colIndex].isMine = false;
        setPoints(points + 1);
        return;
      }
      playMine();
      setGameStatus("Blown Up");
      revealBoard();

      if (activeTab === 'multiplayer' && isJoined) {
        socket.emit('endGame', {
          roomID: RoomID,
          playerID: playerID,
          score: points, 
          status: "Blown Up"
        });
      }
    };

    const handleNuke = () => {
      playNuke();
      setGameStatus("Obliterated");
      revealBoard();

      const newPoints = roundStartPointsRef.current;
      setPoints(newPoints);

      if (activeTab === 'multiplayer' && isJoined) {
        socket.emit('endGame', {
          roomID: RoomID,
          playerID: playerID,
          score: newPoints, 
          status: "Obliterated"
        });
      }
    };

    const handleSafeCell = (multiplier) => {
      let turnsLeft = rows * cols - minesCount - nukeCount - clicks - (pickaxeTriggerChance > 0 ? 1 : 0);
      let earnedPoints = (100 * minesCount * multiplier) / Math.max(1, turnsLeft);
      
      const updatedPoints = points + earnedPoints;
      setPoints(updatedPoints);

      if (turnsLeft <= 1) {
        playVictory();
        setGameStatus("Victory");
        revealBoard();

        if (activeTab === 'multiplayer' && isJoined) {
          socket.emit('endGame', {
            roomID: RoomID,
            playerID: playerID,
            score: updatedPoints,
            status: "Victory"
          });
        }
      }
    };

    const handlePickaxe = (chance) => {
      let len = rows * cols;
      let listOfVals = Array.from({ length: len }, (_, index) => index);
      if (Math.random() <= chance) {
        for (let i = 0; i < rows * cols; i++) {
          let index = Math.floor(Math.random() * len);
          let number = listOfVals[index];

          let row = Math.floor(number / cols);
          let col = Math.floor(number % cols);

          if (board[row][col].isMine || board[row][col].isNuke || board[row][col].visible) {
            listOfVals.splice(index, 1);
            len--;
          } else {
            handleCellClick(row, col, false);
            return pickaxeScore;
          }  
        }
      } return 0;
    };

    let pickaxeMultiplier = 0;
    if (!board[rowIndex][colIndex].visible) {
      board[rowIndex][colIndex].visible = true;
      if (board[rowIndex][colIndex].isMine) {
        handleMine();
      } else {
        if (board[rowIndex][colIndex].isNuke) {
          handleNuke();
        } else {
          if (pickaxeTriggerChance > 0 && isUserClick) {
            pickaxeMultiplier += handlePickaxe(pickaxeTriggerChance);
          }
          if (board[rowIndex][colIndex].isGift) {
            playGift();
            handleSafeCell(pickaxeMultiplier + giftMultiplier);
          } else {
            if(isUserClick){
              playSafe();
              handleSafeCell(pickaxeMultiplier + 1);
            }
          }
        }
      }
      if (!board[rowIndex][colIndex].isShield) {
        setClicks(clicks + 1);
      }
    }
  };

  const handleJoinMultiplayer = (e) => {
    e.preventDefault();
    if (!RoomID.trim() || !nickname.trim()) return;
    setRoomMessage("");
    setIsJoined(true);
    setGameStatus("Lobby");
  };

  const handleLeaveMultiplayer = () => {
    setIsJoined(false);
    setGameStatus("Lobby");
    setPlayersList({});
    setPoints(0);
    setBoard([]);
    setRoomMessage("");
  };

  return (
    <div className='min-h-screen bg-[#09090b] pb-12 text-slate-100'>
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#09090b]/90 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3 whitespace-nowrap font-semibold tracking-wide text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Code2 size={20} /></span>
            Trevor De Clark
          </Link>
          <div className="flex w-full items-center justify-between gap-3 text-xs sm:w-auto sm:gap-5 sm:text-sm">
            <Link to="/" className="text-slate-400 transition hover:text-white">Portfolio</Link>
            <Link to="/mines" className="rounded-full bg-white/10 px-3 py-2 text-violet-200">Mines</Link>
            <Link to="/matching-pairs" className="text-slate-400 transition hover:text-white">Matching Pairs</Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-white/10 bg-[#141419] p-5 font-sans text-slate-200 shadow-2xl sm:p-8">
        {/* MODE TABS */}
        <div className="flex gap-2 border-b border-slate-800 mb-6">
          <button
            onClick={() => { setActiveTab('singleplayer'); handleLeaveMultiplayer(); }}
            className={`flex-1 py-2 font-bold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'singleplayer'
                ? 'border-violet-400 text-violet-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User size={16} /> Singleplayer
          </button>
          <button
            onClick={() => setActiveTab('multiplayer')}
            className={`flex-1 py-2 font-bold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'multiplayer'
                ? 'border-violet-400 text-violet-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={16} /> Multiplayer
          </button>
        </div>

        {/* MULTIPLAYER PROMPT FORM */}
        {activeTab === 'multiplayer' && !isJoined ? (
          <form onSubmit={handleJoinMultiplayer} className="space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-serif font-bold text-slate-100">Join a Room</h3>
              <p className="text-xs text-slate-400">Enter a Room Name and your Nickname to get started.</p>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Multiplayer Room</label>
              <input 
                type="text" 
                required
                value={RoomID}
                onChange={(e) => setRoomID(e.target.value)}
                className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none"
                placeholder="e.g. ROOM123"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Multiplayer Name</label>
              <input 
                type="text" 
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none"
                placeholder="e.g. PlayerOne"
              />
            </div>

            <button 
              type="submit"
              className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl shadow-md shadow-violet-900 hover:bg-violet-400 transition-all flex items-center justify-center gap-2 mt-4 hover:scale-105"
            >
              Enter Room 🚀
            </button>
          </form>
        ) : (
          <>
            {/* GAME HEADER */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-serif text-slate-100 flex items-center justify-center gap-2">
                <Bomb className="text-violet-400" size={24} /> Mines!
              </h2>
              <p className="text-xs text-slate-400 mt-1">Configure your board and test your luck!</p>
              {activeTab === 'multiplayer' && (
                <div className="mt-1 text-xs font-bold text-violet-400">
                  <p>Room: {RoomID} | Player: {nickname}</p>
                  {isJoined && (
                    <button
                      type="button"
                      onClick={handleLeaveMultiplayer}
                      className="mt-1 font-bold text-violet-400 hover:text-violet-200"
                    >
                      Leave Room
                    </button>
                  )}
                </div>
              )}
            </div>

            {roomMessage && (
              <p role="alert" className="mb-4 rounded-xl border border-violet-900 bg-slate-900 px-3 py-2 text-sm text-violet-200">
                {roomMessage}
              </p>
            )}

            {/* INPUT CONTROLS GRID */}
            {gameStatus === "Lobby" && (
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Rows</label>
                  <input 
                    type="number" 
                    min="2"
                    value={rows} 
                    onChange={(e) => setRows(e.target.value)}
                    className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none invalid:text-red-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Cols</label>
                  <input 
                    type="number" 
                    min="2"
                    value={cols} 
                    onChange={(e) => setCols(e.target.value)}
                    className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none invalid:text-red-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Mines</label>
                  <input 
                    type="number" 
                    min={Math.floor(Math.sqrt(rows * cols - 1))}
                    max={rows * cols - 1}
                    value={minesCount} 
                    onChange={(e) => setMinesCount(e.target.value)}
                    className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none invalid:text-red-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Rounds</label>
                  <input 
                    type="number" 
                    min="0"
                    max="10"
                    value={roundsCount} 
                    onChange={(e) => setRoundsCount(e.target.value)}
                    className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none invalid:text-red-500"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Equipped Power-Up
                    </label>
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
                    onChange={(e) => {
                      const newType = e.target.value;
                      const currentList = activeTab === "multiplayer" ? multiplayerPowerUps : powerUps;
                      const foundOption = currentList.find((p) => p.type === newType);

                      if (foundOption) {
                        setSelectedPowerUp(foundOption);
                      }
                    }}
                    className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none invalid:text-red-500"
                  >
                    {(activeTab === "multiplayer" ? multiplayerPowerUps : powerUps).map((option) => (
                      <option
                        key={option.type}
                        value={option.type}
                        className="w-full p-2 bg-slate-900 rounded-xl text-center font-bold text-slate-200 outline-none"
                      >
                        {option.type} ({option.value > 0 ? `+${option.value}` : 'None'})
                      </option>
                    ))}
                  </select>

                  {/* CONDITIONAL DESCRIPTION DISPLAY */}
                  {showDescription && (
                    <div className="mt-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300 animate-fadeIn">
                      <span className="font-bold text-violet-400 block mb-0.5">
                        {selectedPowerUp.type}
                      </span>
                      {typeof selectedPowerUp.description === 'function'
                        ? selectedPowerUp.description(selectedPowerUp.value)
                        : selectedPowerUp.description || "No description available."}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RETURN TO LOBBY BUTTON */}
            {gameStatus !== "Lobby" && (
              <button 
                onClick={() => {
                  setGameStatus("Lobby");
                  socket.emit('statusUpdate', { roomID: RoomID, playerID: playerID, status: "Lobby" });
                }}
                className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl shadow-md shadow-violet-900 hover:bg-violet-400 transition-all flex items-center justify-center gap-2 mb-6 hover:scale-105"
              >
                <CircleArrowLeft size={18} /> Return To Lobby
              </button>
            )}

            {/* START / NEXT ROUND BUTTON */}
            <button 
              onClick={() => {
                if (activeTab === 'multiplayer' && gameStatus === "Lobby") {
                  socket.emit("startGame", { roomID: RoomID, playerID: playerID }, (response) => {
                    if (response?.ok === false) setRoomMessage(response.error || "Could not start the game.");
                    else setRoomMessage("");
                  });
                } else {
                  handleStartNewGame();
                }
              }}
              disabled={activeTab === 'multiplayer' && gameStatus === "Lobby" && (
                Object.keys(playersList).length === 0 ||
                Object.values(playersList).some((player) => player.status !== "Lobby")
              )}
              className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl shadow-md shadow-violet-900 hover:bg-violet-400 transition-all flex items-center justify-center gap-2 mb-6 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {roundsCount > 0 && roundsCount >= currentRound && gameStatus !== "Lobby" ? (
                <span className="flex items-center gap-1.5"> Next Round <ArrowRight size={18}/> </span>
              ) : (
                <span className='flex items-center gap-1.5'> New Game <RefreshCw size={18} /> </span>
              )}
            </button>
            {activeTab === 'multiplayer' && gameStatus === "Lobby" &&
              Object.values(playersList).some((player) => player.status !== "Lobby") && (
                <p className="-mt-4 mb-6 text-center text-xs text-slate-400">
                  Waiting for all players to return to the lobby before starting a new game.
                </p>
              )}

            {/* BOARD GRID DISPLAY */}
            <div className="flex justify-center mb-6">
              <div 
                className="grid gap-2 bg-slate-800 p-3 rounded-2xl"
                style={{ gridTemplateColumns: `repeat(${board[0]?.length || 2}, minmax(0, 1fr))` }}
              >
                {board.map((rowArray, rIdx) => 
                  rowArray.map((cell, cIdx) => (
                    <button
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => handleCellClick(rIdx, cIdx)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-all shadow-sm ${
                        cell.visible 
                          ? cell.isMine 
                            ? 'bg-violet-900 text-white'
                            : cell.isShield 
                              ? 'bg-emerald-400 text-green-500' 
                              : 'bg-[#202027] text-slate-300'
                          : 'bg-violet-700 hover:bg-violet-600 text-transparent'
                      }`}
                    >
                      {cell.visible ? (
                        cell.isMine ? (
                          <BombIcon size={20} className={gameStatus === "Victory" ? "text-green-500" : "text-red-500"} />
                        ) : cell.isNuke ? (
                          <NukeIcon size={20} className={gameStatus === "Victory" ? "text-green-500" : "text-red-500"} />
                        ) : cell.isGift ? (
                          <GiftIcon size={20} className={gameStatus === "Blown Up" || gameStatus === "Obliterated" ? "text-red-500" : "text-green-500"} />
                        ) : cell.isShield ? (
                          <ShieldIcon size={20} className={gameStatus === "Victory" ? "text-white" : "text-black"} />
                        ) : (
                          <SafeIcon size={20} className={gameStatus === "Victory" ? "text-green-500" : gameStatus === "Blown Up" || gameStatus === "Obliterated" ? "text-red-500" : "text-slate-300"} />
                        )
                      ) : '?'}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* LEADERBOARD & STATS FOOTER */}
            <div className="bg-[#111116] p-4 rounded-xl border border-white/10 text-xs space-y-3">
              {activeTab === 'multiplayer' ? (
                <div>
                  <h4 className="font-bold text-slate-200 uppercase tracking-wider mb-2 border-b border-white/10 pb-1 flex items-center justify-between">
                    <span>Leaderboard</span>
                    {gameStatus !== "Lobby" && 
                      (<span className="text-[10px] text-slate-400 font-normal">
                        Mines: {minesCount} | Nukes: {nukeCount}
                      </span>)
                    }
                  </h4>
                  <div className="space-y-2">
                    {Object.values(playersList)
                      .sort((a, b) => (b.score || 0) - (a.score || 0))
                      .map((player, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-[#202027] p-2.5 rounded-lg shadow-sm border border-white/10">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">{player.nickname || 'Player'}</span>
                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-violet-300">
                              {player.status || 'Lobby'}
                            </span>
                          </div>
                          <div className="font-bold text-violet-400">
                            {Math.round((player.score || 0) * 100) / 100} pts
                          </div>
                        </div>
                      ))}
                  </div>
                  {playersList[playerID]?.powerUp?.type && (
                    <p className="mt-3 text-slate-400">
                      Your power-up: {playersList[playerID].powerUp.type}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-slate-300 font-medium">
                  <div>
                    Status: <span className="font-bold text-violet-400 uppercase">{gameStatus}</span>
                  </div>
                  {roundsCount > 0 && (
                    <div>
                      Round: <span className="font-bold text-violet-400">{currentRound} / {roundsCount}</span>
                    </div>
                  )}
                  <div>
                    Points: <span className="font-bold text-violet-400">{Math.round(points * 100) / 100}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Mines;