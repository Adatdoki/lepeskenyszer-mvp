import { Button } from "@/components/ui/button";
import { Card as UICard } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BOARD_SIZE, createInitialState, drawCard, executeMove, getValidMoves, placeCard, placeToken, passTurn } from "@/lib/gameEngine";
import { validateChain } from "@/lib/scoring";
import { Card, GameState } from "@/types/game";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Eye, EyeOff, Settings, Trophy, User, Volume2, VolumeX } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showChainModal, setShowChainModal] = useState(false);
  const [selectedChainCards, setSelectedChainCards] = useState<string[]>([]);
  
  // Írógép effekt állapota
  const [drawnCardForEffect, setDrawnCardForEffect] = useState<Card | null>(null);
  const [typewriterText, setTypewriterText] = useState("");
  
  // Papírgyűrés effekt állapota (tábláról felvett kártya)
  const [pickedCardForEffect, setPickedCardForEffect] = useState<Card | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  
  // Új állapotok az üzenetekhez
  const [topMessage, setTopMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Hangok lejátszása
  const [audioLoop, setAudioLoop] = useState<HTMLAudioElement | null>(null);

  const playSound = (type: 'typewriter' | 'paper' | 'music', loop = false) => {
    if (!soundEnabled) return;
    
    try {
      const audio = new Audio(`/sounds/${type}.mp3`);
      audio.volume = 0.5;
      if (loop) {
        audio.loop = true;
        setAudioLoop(audio);
      }
      audio.play().catch(e => console.log("Audio play failed:", e));
      return audio;
    } catch (e) {
      console.log("Audio error:", e);
    }
  };

  const stopSound = () => {
    if (audioLoop) {
      audioLoop.pause();
      audioLoop.currentTime = 0;
      setAudioLoop(null);
    }
  };

  // Játék indítása
  const startGame = (playerCount: number, mode: 'light' | 'advanced') => {
    const newState = createInitialState(playerCount, mode);
    setGameState(newState);
    setTopMessage("Pályaépítés! Rakj le egy kártyát a kezedből a táblára (hátlappal).");
    setErrorMessage(null);
  };

  // Időzítő
  useEffect(() => {
    if (!gameState || gameState.isGameOver) return;

    const timer = setInterval(() => {
      setGameState(prev => {
        if (!prev) return null;
        if (prev.timeLeft <= 0) {
          clearInterval(timer);
          return { ...prev, isGameOver: true };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState?.isGameOver]);

  // Hibaüzenet automatikus eltüntetése
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Mező kattintás kezelése
  const handleCellClick = (x: number, y: number) => {
    if (!gameState || gameState.isGameOver) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    // 0. Fázis: Setup (Pályaépítés)
    if (gameState.phase === 'setup') {
      if (!selectedCardId) {
        setErrorMessage("Először válassz ki egy kártyát a kezedből!");
        return;
      }

      // Validáció: csak üres helyre
      if (gameState.board[y][x] !== null) {
        setErrorMessage("Ez a mező már foglalt!");
        return;
      }

      // Validáció: szomszédosság (kivéve ha üres a tábla)
      const hasAnyCard = gameState.board.some(row => row.some(cell => cell !== null));
      if (hasAnyCard) {
        const hasNeighbor = [
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
          { dx: -1, dy: 0 },                     { dx: 1, dy: 0 },
          { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 }
        ].some(d => {
          const nx = x + d.dx;
          const ny = y + d.dy;
          return nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && gameState.board[ny][nx] !== null;
        });

        if (!hasNeighbor) {
          setErrorMessage("Csak meglévő kártya mellé rakhatsz!");
          return;
        }
      }

      const newState = placeCard(gameState, selectedCardId, { x, y });
      setGameState(newState);
      setSelectedCardId(null);
      
      if (newState.phase === 'setup_token') {
        setTopMessage("Pálya kész! Most helyezd el a bábudat egy üres mezőre.");
      } else {
        setTopMessage("Kártya lerakva. Következő játékos jön.");
      }
      setErrorMessage(null);
      return;
    }

    // 0.5 Fázis: Setup Token (Bábu lerakás)
    if (gameState.phase === 'setup_token') {
      // Validáció: csak üres helyre (nincs kártya, nincs bábu)
      if (gameState.board[y][x] !== null) {
        setErrorMessage("Ide nem rakhatod, itt kártya van!");
        return;
      }
      const isOccupied = gameState.players.some(p => p.position?.x === x && p.position?.y === y);
      if (isOccupied) {
        setErrorMessage("Itt már áll valaki!");
        return;
      }

      const newState = placeToken(gameState, { x, y });
      setGameState(newState);
      
      if (newState.phase === 'move') {
        setTopMessage("Minden bábu a helyén. Kezdődik a játék! Lépj lóugrásban.");
      } else {
        setTopMessage("Bábu lerakva. Következő játékos jön.");
      }
      setErrorMessage(null);
      return;
    }

    // 1. Fázis: Mozgás
    if (gameState.phase === 'move') {
      const validMoves = getValidMoves(gameState, currentPlayer.id);
      const isValid = validMoves.some(m => m.x === x && m.y === y);

      if (isValid) {
        // Ellenőrizzük, hogy vett-e fel kártyát (volt-e ott kártya)
        const targetCard = gameState.board[y][x];
        
        const newState = executeMove(gameState, { from: currentPlayer.position!, to: { x, y } });
        setGameState(newState);
        
        // Ha vett fel kártyát, indítjuk a papírgyűrés effektet
        if (targetCard) {
           setPickedCardForEffect(targetCard);
           setIsRevealing(true);
           playSound('paper'); // Egyszeri lejátszás
        }
        
        // Ellenőrizzük, hogy kényszerlerakás van-e
        if (newState.phase === 'place_after_move') {
          setTopMessage("Lépés sikeres, de betelt a kezed! Előbb rakj le egy lapot!");
        } else {
          setTopMessage("Lépés sikeres! Most húzz egy kártyát a talonból.");
        }
        
        setErrorMessage(null);
      } else {
        // Ellenőrizzük, hogy volt-e kényszerlépés
        const cardMoves = validMoves.filter(m => gameState.board[m.y][m.x] !== null);
        if (cardMoves.length > 0 && gameState.board[y][x] === null) {
          setErrorMessage("KÖTELEZŐ kártyára lépned, ha van elérhető!");
        } else {
          setErrorMessage("Érvénytelen lépés! Csak lóugrásban léphetsz.");
        }
      }
    }
    
    // 3. Fázis: Lerakás (Bármelyik lerakási fázis)
    else if (gameState.phase === 'place' || gameState.phase === 'place_after_move' || gameState.phase === 'place_after_draw') {
      if (!selectedCardId) {
        setErrorMessage("Először válassz ki egy kártyát a kezedből!");
        return;
      }
      
      const newState = placeCard(gameState, selectedCardId, { x, y });
      if (newState !== gameState) {
        setGameState(newState);
        setSelectedCardId(null);
        
        // Üzenet frissítése a következő fázis alapján
        if (newState.phase === 'draw') {
          setTopMessage("Kártya lerakva. Most húzz egyet a talonból!");
        } else if (newState.phase === 'move') {
          setTopMessage("Kártya lerakva. Következő játékos jön.");
        } else if (newState.phase === 'place_after_draw') {
           setTopMessage("Még mindig túl sok lapod van! Rakj le még egyet.");
        }

        setErrorMessage(null);
      } else {
        setErrorMessage("Ide nem rakhatsz kártyát!");
      }
    }
  };

  // Húzás gomb
  const handleDraw = () => {
    if (!gameState || gameState.phase !== 'draw') return;
    const newState = drawCard(gameState);
    
    // Megkeressük a frissen húzott kártyát az effekthez
    const player = newState.players[newState.currentPlayerIndex];
    const drawnCard = player.hand[player.hand.length - 1]; // Az utolsó lap a húzott
    
    setDrawnCardForEffect(drawnCard);
    setTypewriterText("");
    setGameState(newState);
    // playSound('paper'); // Ezt most az írógép effekt váltja ki
    
    if (player.hand.length > 5) {
      setTopMessage("Kártya felhúzva! Túl sok lapod van (>5), KÖTELEZŐ leraknod egyet!");
    } else {
      setTopMessage("Kártya felhúzva! Rakj le egyet, vagy PASSZOLJ (mivel <= 5 lapod van).");
    }
    setErrorMessage(null);
  };

  // Írógép effekt logika
  useEffect(() => {
    if (!drawnCardForEffect) {
      stopSound();
      return;
    }

    const fullText = `${drawnCardForEffect.type}\n${drawnCardForEffect.title}\n\n${drawnCardForEffect.description}`;
    let currentIndex = 0;
    
    // Hang indítása loopolva, és a referencia mentése lokálisan
    const currentAudio = playSound('typewriter', true);

    const interval = setInterval(() => {
      if (currentIndex < fullText.length) {
        setTypewriterText(prev => prev + fullText[currentIndex]);
        currentIndex++;
        
        // Ha ez volt az utolsó karakter, azonnal állítsuk le a hangot
        if (currentIndex >= fullText.length) {
          clearInterval(interval);
          if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
          }
          stopSound(); // State takarítása
        }
      }
    }, 80); // Lassított gépelési sebesség (50 -> 80ms)

    return () => {
      clearInterval(interval);
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      stopSound();
    };
  }, [drawnCardForEffect]);

  // Papírgyűrés effekt időzítő (3mp)
  useEffect(() => {
    if (pickedCardForEffect && isRevealing) {
      const timer = setTimeout(() => {
        setIsRevealing(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [pickedCardForEffect, isRevealing]);

  // Passz gomb
  const handlePass = () => {
    if (!gameState || gameState.phase !== 'place') return;
    const newState = passTurn(gameState);
    if (newState === gameState) {
      setErrorMessage("Nem passzolhatsz! Túl sok lapod van (>5).");
      return;
    }
    setGameState(newState);
    setTopMessage("Passzoltál. Következő játékos jön.");
    setErrorMessage(null);
  };

  // Lánc bejelentése
  const handleAnnounceChain = () => {
    if (!gameState) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const selectedCards = currentPlayer.hand.filter(c => selectedChainCards.includes(c.id));
    
    const validation = validateChain(selectedCards);
    
    if (validation.isValid) {
      const newState = JSON.parse(JSON.stringify(gameState));
      const player = newState.players[newState.currentPlayerIndex];
      
      // Kártyák eltávolítása a kézből
      player.hand = player.hand.filter((c: Card) => !selectedChainCards.includes(c.id));
      
      // Lánc hozzáadása
      player.chains.push({
        id: crypto.randomUUID(),
        cards: selectedCards,
        isValid: true,
        isRejected: false,
        points: validation.points
      });
      
      player.score += validation.points;
      
      if (validation.points > 0) {
        newState.logs.push(`${player.name} bejelentett egy láncot (+${validation.points} pont).`);
        setTopMessage(`Sikeres lánc! +${validation.points} pont`);
      } else {
        newState.logs.push(`${player.name} HIBÁS láncot jelentett be (${validation.points} pont).`);
        setTopMessage(`HIBÁS LÁNC! ${validation.points} pont levonás.`);
      }

      // Ha láncbejelentés után a kézméret lecsökken 5-re vagy alá,
      // és éppen kényszerlerakás fázisban voltunk, akkor fel kell oldani a kényszert.
      if (player.hand.length <= 5) {
        if (newState.phase === 'place_after_move') {
          newState.phase = 'draw'; // Mehet tovább a húzásra
          setTopMessage("Lánc bejelentve, kézméret rendben. Most húzz egy kártyát!");
        } else if (newState.phase === 'place_after_draw') {
          newState.phase = 'place'; // Visszaáll opcionális lerakásra
          setTopMessage("Lánc bejelentve, kézméret rendben. Rakj le egyet vagy passzolj.");
        }
      }
      
      setGameState(newState);
      setShowChainModal(false);
      setSelectedChainCards([]);
      setErrorMessage(null);
    } else {
      setErrorMessage(validation.reason || "Érvénytelen lánc!");
    }
  };

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-4" 
           style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/aged-paper.png")' }}>
        <UICard className="w-full max-w-md p-8 bg-neutral-800 border-neutral-700 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-display font-bold text-red-700 mb-2 tracking-wider">LÉPÉSKÉNYSZER</h1>
            <h2 className="text-xl font-typewriter text-neutral-400 uppercase tracking-widest">Kompromat (Tiny)</h2>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button onClick={() => startGame(2, 'light')} className="h-24 text-lg font-typewriter bg-neutral-700 hover:bg-neutral-600 border-2 border-neutral-600">
                2 Játékos<br/><span className="text-xs opacity-70">Tiny Mód</span>
              </Button>
              <Button onClick={() => startGame(3, 'light')} className="h-24 text-lg font-typewriter bg-neutral-700 hover:bg-neutral-600 border-2 border-neutral-600">
                3 Játékos<br/><span className="text-xs opacity-70">Tiny Mód</span>
              </Button>
              <Button onClick={() => startGame(4, 'light')} className="h-24 text-lg font-typewriter bg-neutral-700 hover:bg-neutral-600 border-2 border-neutral-600">
                4 Játékos<br/><span className="text-xs opacity-70">Tiny Mód</span>
              </Button>
              <Button onClick={() => setShowRules(true)} variant="outline" className="h-24 text-lg font-typewriter border-2 border-neutral-600 text-neutral-300">
                Szabályok
              </Button>
            </div>
            
            <div className="flex justify-center pt-4 border-t border-neutral-700">
              <Link href="/settings">
                <Button variant="ghost" className="text-neutral-400 hover:text-white font-typewriter">
                  <Settings className="w-4 h-4 mr-2" />
                  Beállítások
                </Button>
              </Link>
            </div>
          </div>
        </UICard>

        <Dialog open={showRules} onOpenChange={setShowRules}>
          <DialogContent className="bg-neutral-100 text-neutral-900 font-typewriter max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold border-b-2 border-neutral-900 pb-2 mb-4">SZIGORÚAN TITKOS</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-base font-readable">
              <p><strong>CÉL:</strong> Gyűjts össze kompromittáló anyagokat (kártyákat) és építs belőlük láncolatokat.</p>
              <p><strong>SETUP:</strong> Építsétek meg a pályát a kezetekben lévő lapokból, majd helyezzétek el a bábukat.</p>
              <p><strong>MOZGÁS:</strong> Lóugrásban. Ha tudsz kártyára lépni, KÖTELEZŐ oda lépni.</p>
              <p><strong>AKCIÓ:</strong> Lépés után mindig húzol a talonból.</p>
              <p><strong>LERAKÁS:</strong> Ha 5-nél több lapod van, le kell raknod.</p>
              <ul className="list-disc pl-5">
                <li>Talonból húzott lap → <strong>REJTETTEN</strong> rakható le.</li>
                <li>Kézből/Tábláról való lap → <strong>NYÍLTAN</strong> kell lerakni.</li>
              </ul>
              <p><strong>LÁNC:</strong> 3-as (2 pont) vagy 4-es (4 pont) lánc bejelentése a köröd elején.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans overflow-hidden flex flex-col"
         style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/aged-paper.png")' }}>
      
      {/* Header */}
      <header className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6 shadow-lg z-10">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="text-xl font-display font-bold text-red-600 tracking-wider leading-none">LÉPÉSKÉNYSZER</div>
            <div className="text-xs font-typewriter text-neutral-400 tracking-[0.2em] leading-none mt-1">KOMPROMAT</div>
          </div>
          <div className="h-8 w-px bg-neutral-600 mx-2"></div>
          <div className="flex items-center gap-2 text-neutral-300 font-typewriter">
            <Clock className="w-4 h-4" />
            <span>{Math.floor(gameState.timeLeft / 60)}:{(gameState.timeLeft % 60).toString().padStart(2, '0')}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {topMessage && (
            <div className="bg-neutral-900/80 px-4 py-2 rounded border border-neutral-600 text-yellow-400 font-typewriter text-sm animate-pulse">
              {topMessage}
            </div>
          )}
        </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} className="text-neutral-400 hover:text-neutral-200">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
            <div className="flex items-center gap-2 px-3 py-1 bg-neutral-700 rounded border border-neutral-600">
            <User className="w-4 h-4" style={{ color: currentPlayer.color }} />
            <span className="font-bold" style={{ color: currentPlayer.color }}>{currentPlayer.name}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowRules(true)}>Szabályok</Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Players */}
        <div className="w-64 bg-neutral-800 border-r border-neutral-700 p-4 flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-sm font-typewriter text-neutral-400 uppercase border-b border-neutral-700 pb-2">Ügynökök</h3>
          {gameState.players.map(player => (
            <UICard key={player.id} className={`p-3 bg-neutral-700 border-l-4 ${gameState.currentPlayerIndex === player.id ? 'border-yellow-500 ring-1 ring-yellow-500/50' : 'border-transparent'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold" style={{ color: player.color }}>{player.name}</span>
                <div className="flex items-center gap-1 bg-neutral-900 px-2 py-0.5 rounded text-xs">
                  <Trophy className="w-3 h-3 text-yellow-500" />
                  <span>{player.score}</span>
                </div>
              </div>
              <div className="text-xs text-neutral-400 flex justify-between">
                <span>Kézben: {player.hand.length} lap</span>
                <span>Láncok: {player.chains.length}</span>
              </div>
            </UICard>
          ))}

          <div className="mt-auto">
            <h3 className="text-sm font-typewriter text-neutral-400 uppercase border-b border-neutral-700 pb-2 mb-2">Napló</h3>
            <ScrollArea className="h-48 rounded bg-neutral-900 p-2 text-xs font-mono text-neutral-300">
              {gameState.logs.slice().reverse().map((log, i) => (
                <div key={i} className="mb-1 opacity-80 border-b border-neutral-800 pb-1 last:border-0">
                  {log}
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>

        {/* Center - Board */}
        <div className="flex-1 bg-neutral-800/50 p-8 flex items-center justify-center relative overflow-auto">
          <div 
            className="grid gap-1 bg-neutral-900 p-4 rounded shadow-2xl border border-neutral-700"
            style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
          >
            {gameState.board.map((row, y) => (
              row.map((card, x) => {
                const isPlayerHere = gameState.players.find(p => p.position?.x === x && p.position?.y === y);
                const isValidMove = gameState.phase === 'move' && 
                  getValidMoves(gameState, currentPlayer.id).some(m => m.x === x && m.y === y);
                
                // Setup fázisban valid helyek jelölése
                let isSetupValid = false;
                if (gameState.phase === 'setup' && selectedCardId) {
                   // ... (fenti logika ismétlése a vizuális jelzéshez, ha kellene, de most egyszerűsítünk)
                }

                return (
                  <div 
                    key={`${x}-${y}`}
                    onClick={() => handleCellClick(x, y)}
                    className={`
                      w-16 h-16 border border-neutral-700 rounded flex items-center justify-center relative cursor-pointer transition-all
                      ${isValidMove ? 'bg-green-900/40 hover:bg-green-900/60 ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)] z-10' : 'bg-neutral-800 hover:bg-neutral-750'}
                      ${card ? 'bg-neutral-700' : ''}
                    `}
                  >
                    {/* Kártya megjelenítése Tooltip-pel */}
                    {card && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`w-14 h-14 rounded flex items-center justify-center text-xs text-center p-1 shadow-sm
                            ${card.isHidden ? 'bg-neutral-600' : 'bg-neutral-200 text-neutral-900'}
                          `}>
                            {card.isHidden ? (
                              <div className="w-full h-full flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-50">
                                <EyeOff className="w-6 h-6 text-neutral-400" />
                              </div>
                            ) : (
                              <div className="flex flex-col overflow-hidden">
                                <span className="font-bold text-[10px] uppercase text-neutral-500">{card.type}</span>
                                <span className="font-bold leading-tight">{card.title}</span>
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        {!card.isHidden && (
                          <TooltipContent className="bg-neutral-100 text-neutral-900 border-2 border-neutral-800 p-4 max-w-xs shadow-xl z-50">
                            <div className="font-typewriter font-bold text-lg mb-2 border-b border-neutral-400 pb-1">{card.title}</div>
                            <div className="text-xs font-bold uppercase text-neutral-500 mb-2">{card.type}</div>
                            <div className="font-readable text-sm leading-relaxed">{card.description}</div>
                            {card.year && <div className="mt-2 text-right font-typewriter text-red-700">{card.year}</div>}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )}

                    {/* Játékos bábu */}
                    {isPlayerHere && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div 
                          className="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                          style={{ backgroundColor: isPlayerHere.color }}
                        >
                          <User className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                    
                    {/* Koordináta (debug) */}
                    {/* <span className="absolute bottom-0 right-0 text-[8px] text-neutral-600">{x},{y}</span> */}
                  </div>
                );
              })
            ))}
          </div>

          {/* Error Toast */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-red-900/90 text-white px-6 py-3 rounded shadow-xl border border-red-500 font-bold z-50"
              >
                {errorMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar - Hand & Actions */}
        <div className="w-80 bg-neutral-800 border-l border-neutral-700 p-4 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-neutral-700 pb-2">
            <h3 className="text-sm font-typewriter text-neutral-400 uppercase">Kezedben lévő akták</h3>
            <span className={`text-xs font-bold ${currentPlayer.hand.length > 5 ? 'text-red-500 animate-pulse' : 'text-neutral-500'}`}>
              {currentPlayer.hand.length}/5
            </span>
          </div>

          <ScrollArea className="flex-1 -mx-2 px-2">
            <div className="space-y-2">
              {currentPlayer.hand.map(card => {
                // Ha éppen gépelés alatt van a kártya, ne mutassuk a kézben
                if (drawnCardForEffect && card.id === drawnCardForEffect.id) return null;
                
                // Ha éppen papírgyűrés alatt van a kártya (most vettük fel), ne mutassuk a kézben
                if (pickedCardForEffect && card.id === pickedCardForEffect.id) return null;

                const isSelected = selectedCardId === card.id;
                const isJustDrawn = card.id === gameState.lastDrawnCardId;
                
                return (
                  <div 
                    key={card.id}
                    onClick={() => {
                      if (gameState.phase === 'setup' || gameState.phase === 'place' || gameState.phase === 'place_after_move' || gameState.phase === 'place_after_draw') {
                        setSelectedCardId(isSelected ? null : card.id);
                      }
                    }}
                    className={`
                      p-3 rounded border cursor-pointer transition-all relative
                      ${isSelected ? 'bg-yellow-900/30 border-yellow-500 ring-1 ring-yellow-500' : 'bg-neutral-700 border-neutral-600 hover:border-neutral-500'}
                      ${isJustDrawn ? 'ring-2 ring-blue-500' : ''}
                    `}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold uppercase text-neutral-400">{card.type}</span>
                      {isJustDrawn && <span className="text-[10px] bg-blue-600 px-1 rounded text-white">ÚJ</span>}
                    </div>
                    <div className="font-bold text-base mb-1 font-typewriter tracking-wide">{card.title}</div>
                    <div className="text-sm text-neutral-300 font-readable leading-snug mt-1">{card.description}</div>
                    
                    {/* Lerakási infó */}
                    {isSelected && (gameState.phase === 'place' || gameState.phase === 'place_after_move' || gameState.phase === 'place_after_draw') && (
                      <div className="mt-2 text-xs font-bold text-center bg-neutral-900/50 py-1 rounded">
                        {isJustDrawn ? "REJTETTEN kerül le" : "NYÍLTAN kerül le"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="mt-auto space-y-2">
            {gameState.phase === 'draw' && (
              <Button onClick={handleDraw} className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-6 animate-pulse">
                KÁRTYA HÚZÁSA (KÖTELEZŐ)
              </Button>
            )}
            
            {(gameState.phase === 'place_after_move' || gameState.phase === 'place_after_draw') && (
               <div className="w-full bg-red-900/50 border border-red-500 text-red-200 p-2 text-center text-sm font-bold animate-pulse rounded">
                 TÚL SOK LAP! KÖTELEZŐ LERAKNI!
               </div>
            )}

            {gameState.phase === 'place' && currentPlayer.hand.length <= 5 && (
              <Button onClick={handlePass} className="w-full bg-neutral-600 hover:bg-neutral-500 text-white font-bold py-4 border border-neutral-500">
                PASSZ (Nem rakok le lapot)
              </Button>
            )}
            
            <Button 
              onClick={() => setShowChainModal(true)} 
              variant="secondary" 
              className="w-full border border-neutral-600"
              disabled={gameState.phase === 'setup' || gameState.phase === 'setup_token'}
            >
              Lánc bejelentése
            </Button>
          </div>
        </div>
      </div>

      {/* Chain Selection Modal */}
      <Dialog open={showChainModal} onOpenChange={setShowChainModal}>
        <DialogContent className="bg-neutral-800 text-neutral-100 border-neutral-700 max-w-3xl">
          <DialogHeader>
            <DialogTitle>Válassz kártyákat a lánchoz</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-4 gap-4 py-4">
            {currentPlayer.hand.map(card => (
              <div 
                key={card.id}
                onClick={() => {
                  if (selectedChainCards.includes(card.id)) {
                    setSelectedChainCards(prev => prev.filter(id => id !== card.id));
                  } else {
                    if (selectedChainCards.length < 4) {
                      setSelectedChainCards(prev => [...prev, card.id]);
                    }
                  }
                }}
                className={`
                  p-2 rounded border cursor-pointer text-center h-32 flex flex-col justify-between
                  ${selectedChainCards.includes(card.id) ? 'bg-green-900/50 border-green-500' : 'bg-neutral-700 border-neutral-600'}
                `}
              >
                <span className="text-[10px] uppercase text-neutral-400">{card.type}</span>
                <span className="font-bold text-sm">{card.title}</span>
                <div className="w-4 h-4 rounded-full border border-neutral-500 mx-auto mt-2 flex items-center justify-center">
                  {selectedChainCards.includes(card.id) && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowChainModal(false)}>Mégse</Button>
            <Button onClick={handleAnnounceChain} disabled={selectedChainCards.length < 3}>Bejelentés</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Írógép Effekt Dialog */}
      <Dialog open={!!drawnCardForEffect} onOpenChange={(open) => !open && setDrawnCardForEffect(null)}>
        <DialogContent className="bg-[#f4f1ea] border-neutral-400 text-neutral-900 max-w-lg shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-typewriter text-xl text-center text-red-700 tracking-widest uppercase border-b-2 border-red-700/30 pb-2">
              SZIGORÚAN TITKOS
            </DialogTitle>
          </DialogHeader>
          
          <div className="min-h-[200px] p-8 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] bg-[#fdfbf7] border border-neutral-300 font-typewriter text-lg leading-relaxed whitespace-pre-wrap text-neutral-900 shadow-inner relative">
            {/* Pecsét effekt */}
            <div className="absolute top-2 right-2 border-2 border-red-600 text-red-600 text-xs font-bold px-2 py-1 rotate-[-12deg] opacity-70 pointer-events-none uppercase">
              {drawnCardForEffect?.type || "BIZALMAS"}
            </div>
            
            {/* Szöveg renderelése piros kiemeléssel */}
            {(() => {
              // Ha a szöveg tartalmazza a kategóriát (pl. "SZEMÉLY:"), azt pirossal emeljük ki
              const parts = typewriterText.split(/([A-ZÁÉÍÓÖŐÚÜŰ]+:)/);
              return (
                <>
                  {parts.map((part, i) => (
                    <span key={i} className={part.match(/^[A-ZÁÉÍÓÖŐÚÜŰ]+:$/) ? "text-red-700 font-bold" : ""}>
                      {part}
                    </span>
                  ))}
                  <span className="animate-pulse text-black">_</span>
                </>
              );
            })()}
          </div>

          <div className="flex justify-center mt-4">
            <Button 
              onClick={() => setDrawnCardForEffect(null)}
              className="bg-neutral-800 hover:bg-neutral-700 text-white font-typewriter border border-neutral-600 shadow-lg"
            >
              ÁTVÉTEL
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Papírgyűrés Effekt Dialog */}
      <Dialog open={!!pickedCardForEffect} onOpenChange={(open) => !open && setPickedCardForEffect(null)}>
        <DialogContent className="bg-neutral-800 border-neutral-600 text-neutral-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-typewriter text-xl text-center text-yellow-500 tracking-widest">
              {isRevealing ? "KUTATÁS AZ AKTÁKBAN..." : "BIZONYÍTÉK MEGSZEREZVE!"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="min-h-[200px] flex flex-col items-center justify-center p-6 bg-[#f0e6d2] text-black border border-neutral-500 font-typewriter text-lg leading-relaxed whitespace-pre-wrap shadow-inner rotate-1 relative overflow-hidden">
            {isRevealing ? (
              <div className="flex flex-col items-center animate-pulse">
                <div className="w-16 h-20 border-2 border-black mb-4 bg-[#e6dac0] shadow-lg animate-[spin_1s_ease-in-out_infinite]" />
                <span className="text-sm font-bold tracking-widest">LAPOZÁS...</span>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full"
              >
                <div className="font-bold mb-2 border-b border-black pb-1">{pickedCardForEffect?.title}</div>
                {pickedCardForEffect?.description}
              </motion.div>
            )}
          </div>

          <div className="flex justify-center mt-4">
            <Button 
              onClick={() => setPickedCardForEffect(null)}
              disabled={isRevealing}
              className={`
                font-bold border transition-all duration-300
                ${isRevealing 
                  ? 'bg-neutral-600 text-neutral-400 border-neutral-700 cursor-not-allowed opacity-50' 
                  : 'bg-yellow-700 hover:bg-yellow-600 text-white border-yellow-800'
                }
              `}
            >
              {isRevealing ? "KERESÉS..." : "ELFOGADOM"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
