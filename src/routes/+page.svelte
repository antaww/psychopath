<script context="module" lang="ts">
	// Declare confetti function type for TypeScript
	// This ensures it's globally available for the component instance script
	declare function confetti(options?: any): Promise<null> | null;
</script>

<script lang="ts">
	import '$lib/logger';
	import { browser } from '$app/environment';
	import { onMount, onDestroy, tick } from 'svelte';
	import { fly } from 'svelte/transition'; // ADDED: For swipe animation
	import { supabase } from '$lib/supabaseClient'; // Importer le client Supabase
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import Button from '$lib/components/Button.svelte'; // Import the new Button component
	import { particles, createParticles, updateAndDrawParticles, EXPLOSION_DURATION } from '$lib/explosionParticles';

	let nickname = '';
	let gameMode = ''; // 'speedrun', 'infinite' or 'training' or 'anxiety'
	let isPlaying = false;
	let currentLevel = 0;
	let timerValue = 0; // Will be in milliseconds
	let timerInterval: number | undefined = undefined; // To store the ID of the timer interval
	let startTime: number = 0; // To store the timestamp when the timer starts

	let currentDifficulty = 0;
	let levelsCount = 15;

	let cellPathColor = "rgba(252,225,18,0.3)";

	const availableColors = [
		{ name: 'Red', value: 'rgba(243,75,47,0.55)', display: '#F34B2FD9' }, // Initial selected
		{ name: 'Dark Red', value: 'rgba(222,63,63,0.55)', display: '#DE3F3FD9' },
		{ name: 'Yellow', value: 'rgba(232,191,31,0.55)', display: '#E8BF1FD9' },
		{ name: 'Brown', value: 'rgba(160,86,61,0.55)', display: '#A0563DD9' },
		{ name: 'Light Green', value: 'rgba(136,206,110,0.55)', display: '#88CE6ED9' },
		{ name: 'Dark Green', value: 'rgba(33,70,12,0.55)', display: '#21460CD9' },
		{ name: 'Light Blue', value: 'rgba(181,242,237,0.55)', display: '#B5F2EDD9' },
		{ name: 'Blue', value: 'rgba(40,65,180,0.55)', display: '#2841B4D9' },
		{ name: 'Purple', value: 'rgba(118,69,187,0.55)', display: '#7645BBD9' },
		{ name: 'Pink', value: 'rgba(210,71,203,0.55)', display: '#D247CBD9' },
		{ name: 'Beige', value: 'rgba(242,215,181,0.55)', display: '#F2D7B5D9' },
		{ name: 'Black', value: 'rgba(0,0,0,0.55)', display: '#000000D9' }
	];
	let userCellsColor = availableColors[0].value; // Initialize with the first color

	let canvasElement: HTMLCanvasElement; 
	let ctx: CanvasRenderingContext2D | null = null;

	let drawnCells: number[][] = []; 
	let userClickedCells: number[][] = []; 

	let isClicking = false;
	let levelFinished = false;

	let isNicknameValid = false;
	let selectedTrainingDifficulty: number = 5; // Default difficulty for training mode (5x5 grid)

	let showRulesModal = false;

	let lastMouseX: number = 0;
	let lastMouseY: number = 0;

	// Keybind Feature State & Logic - START
	let currentKeybind = 'Space'; // User-friendly name (e.g., 'Space', 'Enter', 'a')
	let isChangingKeybind = false;
	const KEYBIND_STORAGE_KEY = 'psychopath-keybind';
	const NICKNAME_STORAGE_KEY = 'psychopath-nickname';

	// Anxiety Mode State - START
	let anxietyCountdownValue: number = 0; // In seconds
	let anxietyCountdownInterval: number | undefined = undefined;
	let anxietyLevel: number = 0; // Number of levels completed in anxiety mode
	const ANXIETY_INITIAL_GRID_SIZE = 2; // Starting grid for anxiety mode
	const ANXIETY_LEVEL_TIME_LIMIT = 10; // 10 seconds per level
	// Anxiety Mode State - END

	function getKeyForEventComparison(bindName: string): string {
		if (bindName === 'Space') return ' ';
		// For most other keys like 'a', 'Shift', 'Control', event.key matches the bindName.
		return bindName;
	}

	function loadKeybindFromStorage() {
		const storedKeybind = localStorage.getItem(KEYBIND_STORAGE_KEY);
		if (storedKeybind) {
			currentKeybind = storedKeybind;
		} else {
			currentKeybind = 'Space'; // Default if nothing stored
		}
	}

	function saveKeybindToStorage(keyToSave: string) {
		localStorage.setItem(KEYBIND_STORAGE_KEY, keyToSave);
	}

	function startChangeKeybindProcess() {
		isChangingKeybind = true;
		// Button text will update reactively
	}

	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (isChangingKeybind) {
			let newKeyRepresentation = event.key;
			if (event.key === ' ') {
				newKeyRepresentation = 'Space';
			}
			// Potentially add more mappings here if needed (e.g. 'Control' -> 'Ctrl')
			// For now, event.key or 'Space' for spacebar.
			currentKeybind = newKeyRepresentation;
			saveKeybindToStorage(currentKeybind);
			isChangingKeybind = false;
			event.preventDefault();
			event.stopPropagation(); // Important to prevent further processing
			tick(); // Ensure UI updates if not already covered by reactivity
			return; // Keybind was changed, do nothing else for this event
		}

		const keyToCompare = getKeyForEventComparison(currentKeybind);
		if (event.key === keyToCompare && isPlaying && !isClicking) {
			const activeEl = document.activeElement;
			if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
				return; // Don't interfere with text input fields
			}
			if (showRulesModal || showGameOverScreen) {
				return; // Don't activate drawing if modals are open
			}

			isClicking = true;
			// Drawing will occur in handleCanvasMouseMove when the mouse moves,
			// as it checks the isClicking flag.
			event.preventDefault(); // Prevent default browser action (e.g., space scrolling)
		}
	}

	function handleGlobalKeyUp(event: KeyboardEvent) {
		const keyToCompare = getKeyForEventComparison(currentKeybind);
		if (event.key === keyToCompare && isPlaying && isClicking) {
			// If isClicking is true, a drawing action was initiated by this keybind (or mouse).
			// It's safe to call handleCanvasMouseUp to finalize it.
			handleCanvasMouseUp(); // This function sets isClicking = false and processes the path.
			event.preventDefault();
		}
	}
	// Keybind Feature State & Logic - END

	// Game Mode Swiper Logic - START
	const gameModeOptions = [
		{ id: 'speedrun', text: 'Speedrun', color: 'green' as const, handlerFunction: handlePlaySpeedrun },
		{ id: 'training', text: 'Training', color: 'lightorange' as const, handlerFunction: handlePlayTraining }
		// { id: 'infinite', text: 'Infinite', color: 'green', handler: handlePlayInfinite } // Can be added later
		, { id: 'anxiety', text: 'Anxiety', color: 'red' as const, handlerFunction: handlePlayAnxiety }
	];
	let currentGameModeIndex = 0;
	let slideInX = 0; // Initial animation state (0 means no slide for the first item)
	let slideOutX = 0; // Initial animation state

	async function showNextMode() {
		slideInX = 300;    // New element enters from the right
		slideOutX = -300;  // Old element exits to the left
		await tick(); // Ensures DOM updates with new slide directions before index change
		currentGameModeIndex = (currentGameModeIndex + 1) % gameModeOptions.length;
	}

	async function showPreviousMode() {
		slideInX = -300;   // New element enters from the left
		slideOutX = 300;   // Old element exits to the right
		await tick(); // Ensures DOM updates with new slide directions before index change
		currentGameModeIndex = (currentGameModeIndex - 1 + gameModeOptions.length) % gameModeOptions.length;
	}

	function selectDisplayedGameMode() {
		const selectedMode = gameModeOptions[currentGameModeIndex];
		selectedMode.handlerFunction(); // This will call handlePlaySpeedrun or handlePlayTraining
	}
	// Game Mode Swiper Logic - END

	// Game Over Screen State
	let showGameOverScreen = false;
	let finalTimeMs = 0;
	let personalBestRank: number | null = null; // Rank of the player's overall best
	let finalTimeActualRank: number | null = null; // Rank of the time just achieved in this game
	let isNewPersonalBest = false;
	let previousPersonalBestMs: number | null = null;

	interface ScoreEntry {
		id: number;
		pseudo: string;
		time_ms: number; // Anciennement time_seconds, stocke toujours des millisecondes
		created_at: string;
	}
	let scoreboardEntries: ScoreEntry[] = [];
	let speedrunScoresChannel: RealtimeChannel | null = null;
	let scoreboardPollInterval: number | undefined = undefined; // For polling

	// Supabase score interfaces for Anxiety mode
	interface AnxietyScoreEntry {
		id: number;
		pseudo: string;
		levels_completed: number;
		created_at: string;
	}
	let anxietyScoreboardEntries: AnxietyScoreEntry[] = [];
	let anxietyScoresChannel: RealtimeChannel | null = null;
	let anxietyScoreboardPollInterval: number | undefined = undefined;

	function handleModalBackdropKeydown(handlerFunction: () => void) {
		return (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault(); // Prevent default space scroll / enter form submission
				handlerFunction();
			}
		};
	}

	// --- Flashlight Effect Logic ---
	let titleElement: HTMLHeadingElement | null = null;
	let flashlightStyle = 'clip-path: circle(0px at 0px 0px);';
	const flashlightRadius = 75; // px, adjust for desired "beam" size

	function handleTitleMouseMove(event: MouseEvent) {
		if (!titleElement) return;
		const rect = titleElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		flashlightStyle = `clip-path: circle(${flashlightRadius}px at ${x}px ${y}px);`;
	}

	function handleTitleMouseEnter() {
		// The mousemove event will immediately set the clip-path.
		// If you want a default position on enter before first move, you could set it here.
		// For now, relying on immediate mousemove.
	}

	function handleTitleMouseLeave() {
		// Reset to a 0px radius circle to hide the lit effect
		flashlightStyle = `clip-path: circle(0px at 0px 0px);`;
	}
	// --- End Flashlight Effect Logic ---

	// --- Explosion Effect Logic --- MOVED TO src/lib/explosionParticles.ts
	// --- End Explosion Effect Logic ---

	// --- Fonctions Supabase pour les scores ---
	async function fetchPlayerRank(playerName: string, scoreToRankMs: number): Promise<number | null> {
		const lowerPlayerName = playerName.toLowerCase();
		try {
			const { data, error, count } = await supabase
				.from('speedrun_scores')
				.select('pseudo', { count: 'exact', head: false })
				.lt('time_ms', scoreToRankMs);

			if (error) {
				console.error('Error fetching player rank:', error);
				return null;
			}

			// The count returned by Supabase with .lt() is the number of scores strictly better.
			// So, rank is count + 1.
			return (count ?? 0) + 1;
		} catch (err) {
			console.error('Exception in fetchPlayerRank:', err);
			return null;
		}
	}

	async function handleScoreSavingAndConfetti(playerName: string, timeMs: number) {
		if (playerName && timeMs > 0) {
			try {
				await saveSpeedrunScore(playerName, timeMs); // This updates isNewPersonalBest, ranks, etc.
				await fetchScoreboard(); // Manually refresh scoreboard for the current user
				
				// Now trigger confetti with the updated isNewPersonalBest
				if (typeof confetti === 'function') {
					confetti({
						particleCount: isNewPersonalBest ? 300 : 150,
						spread: isNewPersonalBest ? 100 : 70,
						origin: { y: 0.6 },
						zIndex: 1005 // Ensure confetti is above the modal (modal z-index is 1000)
					});
				}
			} catch (e) {
				console.error("Error during score processing or confetti:", e);
				// Game over screen is already shown. User can interact with it.
				// Log error, but no automatic redirection.
			}
		} else {
			console.warn("Invalid nickname or time for score processing.", "Nickname:", playerName, "Time:", timeMs);
			// Game over screen shown, but score won't be processed or confetti for PB won't be accurate.
		}
	}

	async function saveSpeedrunScore(playerName: string, timeInMilliseconds: number) {
		if (!playerName) {
			console.log('Player name is empty, score not saved.');
			return;
		}
		const lowerPlayerName = playerName.toLowerCase();

		try {
			// 1. Fetch the existing score
			const { data: existingScoreData, error: fetchError } = await supabase
				.from('speedrun_scores')
				.select('time_ms')
				.eq('pseudo', lowerPlayerName)
				.single(); // We expect 0 or 1 result

			// PGRST116 means "Query returned 0 rows", which is normal if the player doesn't have a score yet.
			if (fetchError && fetchError.code !== 'PGRST116') { 
				console.error('Error fetching existing score:', fetchError);
				// Try to get rank of current time even if fetching existing score fails
				finalTimeActualRank = await fetchPlayerRank(lowerPlayerName, timeInMilliseconds);
				return;
			}

			// 1. Always fetch the rank of the time they just got.
			finalTimeActualRank = await fetchPlayerRank(lowerPlayerName, timeInMilliseconds);

			const existingTimeMs = existingScoreData?.time_ms;
			previousPersonalBestMs = existingTimeMs ?? null; // Store previous PB regardless

			// 2. Compare and decide to update/insert
			if (existingTimeMs === undefined || timeInMilliseconds < existingTimeMs) {
				isNewPersonalBest = true;
				const { data, error: upsertError } = await supabase
					.from('speedrun_scores')
					.upsert({ pseudo: lowerPlayerName, time_ms: timeInMilliseconds }, { onConflict: 'pseudo' });

				if (upsertError) {
					console.error('Error saving/updating speedrun score:', upsertError);
					// personalBestRank will remain null or its old value if upsert fails, but finalTimeActualRank is set
					return; 
				} else {
					console.log('Speedrun score saved/updated:', data);
					personalBestRank = finalTimeActualRank; // New PB, so its rank is the current time's rank
				}
			} else {
				isNewPersonalBest = false;
				console.log(`New score (${formatTime(timeInMilliseconds)}) is not better than existing score (${formatTime(existingTimeMs)}) for ${lowerPlayerName}. Not updating.`);
				// Score not updated, so PB rank is based on their existing best score
				if (existingTimeMs !== undefined) {
					personalBestRank = await fetchPlayerRank(lowerPlayerName, existingTimeMs);
				} else {
					// This case should ideally not happen if !isNewPersonalBest, means no existing score but also not a new best.
					// For safety, set personalBestRank to the current time's rank, as it's the only score we know.
					personalBestRank = finalTimeActualRank;
				}
			}
		} catch (error) {
			console.error('Exception in saveSpeedrunScore:', error);
			// Attempt to fetch rank for current time even on general exception
			if (timeInMilliseconds > 0 && finalTimeActualRank === null) { // Check if not already set
				finalTimeActualRank = await fetchPlayerRank(lowerPlayerName, timeInMilliseconds);
			}
		}
	}

	async function fetchScoreboard() {
		try {
			const { data, error } = await supabase
				.from('speedrun_scores')
				.select('id, pseudo, time_ms, created_at')
				.order('time_ms', { ascending: true })
				.limit(5);

			if (error) {
				console.error('Error fetching scoreboard:', error);
				scoreboardEntries = [];
			} else {
				scoreboardEntries = data as ScoreEntry[];
			}
		} catch (error) {
			console.error('Exception fetching scoreboard:', error);
			scoreboardEntries = [];
		}
	}

	function formatTime(ms: number): string {
		const totalCentiseconds = Math.floor(ms / 10);
		const seconds = Math.floor(totalCentiseconds / 100);
		const centiseconds = totalCentiseconds % 100;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		const paddedMinutes = String(minutes).padStart(2, '0');
		const paddedSeconds = String(remainingSeconds).padStart(2, '0');
		const paddedCentiseconds = String(centiseconds).padStart(2, '0');

		return `${paddedMinutes}:${paddedSeconds}:${paddedCentiseconds}`;
	}

	function startTimer() {
		startTime = performance.now();
		timerValue = 0; // Reset display, first interval will set it based on startTime

		if (timerInterval !== undefined) {
			window.clearInterval(timerInterval);
		}
		timerInterval = window.setInterval(() => {
			timerValue = Math.floor(performance.now() - startTime);
		}, 10); // Update display every 10ms
	}

	function stopTimer() {
		if (timerInterval !== undefined) {
			window.clearInterval(timerInterval);
			timerInterval = undefined;
			// Ensure timerValue has the most up-to-date value based on when stopTimer was called
			// and if startTime was initialized (i.e., timer was actually started)
			if (startTime > 0) {
				timerValue = Math.floor(performance.now() - startTime);
			}
		}
	}

	function handlePlaySpeedrun() {
		gameMode = 'speedrun';
		// Display the nickname request, etc.
		console.log('Play Speedrun');
	}

	function handlePlayInfinite() {
		gameMode = 'infinite';
		// Display the nickname request, etc.
		console.log('Play Infinite');
	}

	function handlePlayTraining() {
		gameMode = 'training';
		selectedTrainingDifficulty = 5; // Reset to default when mode is selected
		nickname = ''; // Not used in training
		console.log('Play Training');
	}

	function handlePlayAnxiety() {
		gameMode = 'anxiety';
		selectedTrainingDifficulty = 0; // Not used, but reset for clarity
		nickname = ''; // Will be used, but allow user to enter (similar to speedrun)
		anxietyLevel = 0; // Reset
		console.log('Play Anxiety');
	}

	function sanitizeNickname(value: string): string {
		return value.replace(/[^a-zA-Z0-9_]/g, '');
	}

	function handleNicknameInput(event: Event) {
		const inputElement = event.target as HTMLInputElement;
		const originalValue = inputElement.value;
		const sanitizedValue = sanitizeNickname(originalValue);

		if (originalValue !== sanitizedValue) {
			inputElement.value = sanitizedValue; // Directly update the input field
		}
		nickname = sanitizedValue;
	}

	$: isNicknameValid = nickname.trim() !== '';

	async function confirmSettingsAndStartGame() {
		if (gameMode === 'speedrun') {
			if (!isNicknameValid) {
				console.warn("Attempted to start speedrun with invalid nickname.");
				return;
			}
			console.log('Starting Speedrun. Nickname:', nickname);
			if (browser) {
				localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
			}
		} else if (gameMode === 'training') {
			console.log('Starting Training with difficulty:', selectedTrainingDifficulty);
			// No nickname validation needed. currentDifficulty will be set from selectedTrainingDifficulty.
		} else if (gameMode === 'anxiety') {
			if (!isNicknameValid) {
				console.warn("Attempted to start anxiety mode with invalid nickname.");
				return;
			}
			console.log('Starting Anxiety mode. Nickname:', nickname);
			if (browser) {
				localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
			}
		} else {
			console.warn("Unknown game mode for starting game:", gameMode);
			return;
		}

		isPlaying = true;
		currentLevel = 0; // Reset level counter for the new game/session

		await tick(); // Wait for DOM update after isPlaying becomes true

		if (gameMode === 'speedrun') {
			startTimer();
			initGrid(5); // Initial difficulty for speedrun is 5
		} else if (gameMode === 'training') {
			// Timer is not used in training mode
			initGrid(selectedTrainingDifficulty);
		} else if (gameMode === 'anxiety') {
			anxietyLevel = 0; // Reset before starting new game
			initGrid(ANXIETY_INITIAL_GRID_SIZE); // Initial grid size for anxiety mode
			// Countdown will start in generateGameLogic
		}
		// Common logic after mode-specific setup
		await generateGameLogic(); // This will increment currentLevel to 1
	}

	function handleColorSelect(selectedColorValue: string) {
		userCellsColor = selectedColorValue;
	}

	function handleLobbyClick() {
		isPlaying = false;
		gameMode = '';
		nickname = '';
		currentLevel = 0;
		if (timerInterval) { // Ensure timerInterval is not undefined
			stopTimer();
		}
		timerValue = 0;
		stopAnxietyCountdown(); // Stop anxiety countdown
		anxietyCountdownValue = ANXIETY_LEVEL_TIME_LIMIT; // Reset countdown display
		anxietyLevel = 0; // Reset anxiety level

		if (ctx && canvasElement) {
			ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
		}
		// Ensure game over screen is hidden when returning to lobby
		showGameOverScreen = false;
		personalBestRank = null;
		finalTimeActualRank = null;
		isNewPersonalBest = false;
		previousPersonalBestMs = null;

		if (browser) {
			const storedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY);
			if (storedNickname) {
				nickname = storedNickname;
			}
		}
	}

	function initGrid(difficulty: number) {
		currentDifficulty = difficulty;
		currentLevel = 0; 
		
		if (canvasElement) { 
			ctx = canvasElement.getContext('2d');
			if (!ctx) {
				console.error("Impossible to get the 2D context of the canvas");
				return;
			}
		} else {
			console.error("The canvas element is not available yet for initGrid.");
		}
	}

	async function generateGameLogic() {
		if (!ctx || !canvasElement) {
			console.error("Context or Canvas not initialized for generateGameLogic");
            if (canvasElement && !ctx) {
                console.log("Attempting to initialize the context in generateGameLogic");
                ctx = canvasElement.getContext('2d');
                if (!ctx) {
                    console.error("Failed to initialize the context in generateGameLogic");
                    return;
                }
            } else if (!canvasElement) {
                 console.error("CanvasElement not available in generateGameLogic");
                 return;
            }
		}
		userClickedCells = [];
		currentLevel += 1;

		if (gameMode === "speedrun") {
			if (levelsCount > 1) {
				if (currentLevel <= 5) {
					currentDifficulty = 5;
				} else if (currentLevel > 5 && currentLevel <= 10) {
					currentDifficulty = 6;
				} else if (currentLevel > 10 && currentLevel <= levelsCount) {
					currentDifficulty = 8;
				}
			}

			if (currentLevel > levelsCount) {
				console.log("Speedrun finished! Score:", timerValue, "Pseudo:", nickname);
				stopTimer();
				finalTimeMs = timerValue; // Store final time
				isPlaying = false; // Stop game interactions
				showGameOverScreen = true; // Show the game over UI immediately

				// Perform score saving, ranking, and confetti in the background
				handleScoreSavingAndConfetti(nickname, finalTimeMs);
				return;
			}
		} else if (gameMode === "training") {
			// currentDifficulty is already set by initGrid(selectedTrainingDifficulty)
			// when the game started via confirmSettingsAndStartGame.
			// No need to change it here.
			// finalTimeMs and timer are not relevant.
			// isPlaying is already true.
			// currentLevel has been incremented.
			console.log(`Training mode: Starting attempt ${currentLevel} with difficulty ${currentDifficulty}`);
		} else if (gameMode === "infinite") {
			currentDifficulty = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
			finalTimeMs = 0;

			// Reset game state for a new speedrun with the same nickname
			isPlaying = true;
			// currentLevel = 0; // This will be incremented by generateGameLogic - already handled
			timerValue = 0;
		} else if (gameMode === "anxiety") {
			// The difficulty for the current level (which is about to be drawn) is based on
			// the number of levels *already successfully completed*.
			currentDifficulty = ANXIETY_INITIAL_GRID_SIZE + anxietyLevel;
			// Start countdown for the level
			startAnxietyCountdown();
		}

		if (gameMode === "speedrun" && levelsCount === 1 && currentLevel === 1) {
			currentDifficulty = 5; 
		}

		fillCanvas("#fff");
		drawGrid("#000", currentDifficulty, currentDifficulty, 1);
		randomPath();
	}

	function fillCanvas(color: string) {
		if (!ctx || !canvasElement) return;
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
	}

	function drawGrid(color: string, rows: number, columns: number, borderSize: number) {
		if (!ctx || !canvasElement) return;
		ctx.strokeStyle = color;
		ctx.lineWidth = borderSize;
		let width = canvasElement.width / columns;
		let height = canvasElement.height / rows;
		for (let i = 0; i <= rows; i++) { 
			ctx.beginPath();
			ctx.moveTo(0, i * height);
			ctx.lineTo(canvasElement.width, i * height);
			ctx.stroke();
		}
		for (let i = 0; i <= columns; i++) { 
			ctx.beginPath();
			ctx.moveTo(i * width, 0);
			ctx.lineTo(i * width, canvasElement.height);
			ctx.stroke();
		}
	}
	
	function getRandomCell(): [number, number] {
		let row = Math.floor(Math.random() * currentDifficulty);
		let column = Math.floor(Math.random() * currentDifficulty);
		return [row, column];
	}

	function colorCell(row: number, column: number, color: string) {
		if (!ctx || !canvasElement) return;
		let cellWidth = canvasElement.width / currentDifficulty;
		let cellHeight = canvasElement.height / currentDifficulty;
		ctx.fillStyle = color;
		ctx.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
	}

	function randomPath() {
		if (!ctx || !canvasElement) {
			console.error("Canvas context or element not available for randomPath.");
			drawnCells = [];
			return;
		}

		const desiredPathCount = Math.max(3, Math.floor(currentDifficulty * currentDifficulty / 3));
		
		fillCanvas("#fff"); // Clear canvas once at the beginning
		drawGrid("#000", currentDifficulty, currentDifficulty, 1);

		let finalPath: [number, number][] = [];

		// More attempts for robustness, especially on dense grids or long paths
		for (let attempt = 0; attempt < 50; attempt++) { 
			const pathStack: [number, number][] = [];
			const visitedInAttempt: boolean[][] = Array(currentDifficulty)
				.fill(null)
				.map(() => Array(currentDifficulty).fill(false));

			if (currentDifficulty <= 0) {
				finalPath = [];
				break;
			}

			let startCell = getRandomCell();
			pathStack.push(startCell);
			visitedInAttempt[startCell[0]][startCell[1]] = true;

			let iterationsInAttempt = 0;
			// Max iterations: squared grid size, as path can't be longer than total cells
			const maxIterationsFactor = currentDifficulty * currentDifficulty * 2; 

			// Renamed and refined helper function
			function wouldCellXBecome4WayJunctionIfYConnects(
				cellX: [number, number],       // The cell we are checking (e.g., currentCell or potentialNextCell)
				cellYConnecting: [number, number], // The cell that would connect to cellX
				visitedInAttemptLocal: boolean[][]
			): boolean {
				const allGridNeighborsOfX = checkNeighbors(cellX[0], cellX[1]);
				let existingPathConnectionsToX = 0;

				for (const gridNeighbor of allGridNeighborsOfX) {
					// If this grid neighbor is the cell that's trying to connect, we don't count it as an *existing* connection yet for this check.
					// We only care about other cells already in the path.
					if (gridNeighbor[0] === cellYConnecting[0] && gridNeighbor[1] === cellYConnecting[1]) {
						continue;
					}
					if (visitedInAttemptLocal[gridNeighbor[0]][gridNeighbor[1]]) {
						existingPathConnectionsToX++;
					}
				}
				// If cellX already has 3 *other* path connections, adding cellYConnecting makes it 4.
				return existingPathConnectionsToX >= 3;
			}

			// Helper function for weighted random selection (remains the same)
			function selectNextCellUsingWeightedLogic(
				selectionPool: [number, number][],
				currentDifficultyLocal: number,
				localEdgePenaltyFactor: number
			): [number, number] | null { // Can return null if selectionPool is empty
				if (selectionPool.length === 0) return null;

				const weightedNeighborsLocal: { cell: [number, number], weight: number }[] = [];
				let totalWeightLocal = 0;

				for (const neighbor of selectionPool) {
					const isEdgeCell =
						neighbor[0] === 0 ||
						neighbor[0] === currentDifficultyLocal - 1 ||
						neighbor[1] === 0 ||
						neighbor[1] === currentDifficultyLocal - 1;
					const weight = isEdgeCell ? 1 : localEdgePenaltyFactor;
					weightedNeighborsLocal.push({ cell: neighbor, weight: weight });
					totalWeightLocal += weight;
				}

				if (totalWeightLocal > 0) {
					let randomChoice = Math.random() * totalWeightLocal;
					for (const weightedItem of weightedNeighborsLocal) {
						randomChoice -= weightedItem.weight;
						if (randomChoice < 0) {
							return weightedItem.cell;
						}
					}
				}
				// Fallback if weights sum to 0 or other issue (should be rare with positive weights)
				return selectionPool[Math.floor(Math.random() * selectionPool.length)];
			}

			while (pathStack.length > 0 && pathStack.length < desiredPathCount && iterationsInAttempt < maxIterationsFactor) {
				iterationsInAttempt++;
				let currentCell = pathStack[pathStack.length - 1];
				const neighbors = checkNeighbors(currentCell[0], currentCell[1]);
				const unvisitedNeighbors = neighbors.filter(
					(n) => !visitedInAttempt[n[0]][n[1]]
				);

				if (unvisitedNeighbors.length > 0) {
					const preferredChoices: [number, number][] = [];
					for (const potentialNext of unvisitedNeighbors) {
						const currentCellBecomesJunction = wouldCellXBecome4WayJunctionIfYConnects(currentCell, potentialNext, visitedInAttempt);
						const potentialNextBecomesJunction = wouldCellXBecome4WayJunctionIfYConnects(potentialNext, currentCell, visitedInAttempt);

						if (!currentCellBecomesJunction && !potentialNextBecomesJunction) {
							preferredChoices.push(potentialNext);
						}
					}

					let determinedNextCell: [number, number] | null = null; 

					if (preferredChoices.length > 0) {
						const edgePenaltyFactor = 3; 
						determinedNextCell = selectNextCellUsingWeightedLogic(preferredChoices, currentDifficulty, edgePenaltyFactor);
					} else if (unvisitedNeighbors.length > 0) {
						// "Sauf s'il n'y a pas le choix" - preferredChoices is empty, but other moves exist (all are "bad")
						// Proceed by picking from all unvisitedNeighbors, accepting a 4-way junction formation.
						const edgePenaltyFactor = 3; 
						determinedNextCell = selectNextCellUsingWeightedLogic(unvisitedNeighbors, currentDifficulty, edgePenaltyFactor);
					}

					if (determinedNextCell) {
						pathStack.push(determinedNextCell);
						visitedInAttempt[determinedNextCell[0]][determinedNextCell[1]] = true;
					} else {
						// Backtrack if no preferred choice (all moves create a 4-way junction at one end or the other)
						// OR if selectNextCellUsingWeightedLogic returned null unexpectedly.
						pathStack.pop(); 
					}
				} else {
					// No unvisited neighbors from current cell, standard backtrack
					pathStack.pop(); 
				}
			}

			if (pathStack.length >= desiredPathCount) {
				finalPath = [...pathStack]; // Found a suitable path
				// console.log(`Path generated on attempt ${attempt + 1}, length: ${finalPath.length}`);
				break; // Exit attempts loop
			} else if (pathStack.length > finalPath.length) {
				// If this attempt didn't reach desired length, but is longer than previous best, keep it
				finalPath = [...pathStack];
			}
		}

		if (finalPath.length === 0 && currentDifficulty > 0) {
			console.warn("Failed to generate any path after all attempts. Using a single random cell as fallback.");
			finalPath = [getRandomCell()];
		} else if (finalPath.length < desiredPathCount && finalPath.length > 0) {
			console.warn(`Generated path length ${finalPath.length} is less than desired ${desiredPathCount}. Using this shorter path.`);
		} else if (finalPath.length === 0 && currentDifficulty === 0) {
			 console.warn("Cannot generate path with zero difficulty.");
		}

		drawnCells = finalPath; // Update global drawnCells

		// Color the cells of the final path
		for (const cell of drawnCells) {
			colorCell(cell[0], cell[1], cellPathColor);
		}
	}

	function checkNeighbors(row: number, column: number): [number, number][] {
		let neighbors: [number, number][] = [];
		if (row > 0) neighbors.push([row - 1, column]);
		if (row < currentDifficulty - 1) neighbors.push([row + 1, column]);
		if (column > 0) neighbors.push([row, column - 1]);
		if (column < currentDifficulty - 1) neighbors.push([row, column + 1]);
		return neighbors;
	}
	
	function handleCanvasMouseDown(event: MouseEvent) {
		if (!isPlaying) return;
		isClicking = true;
		handleCanvasMouseMove(event); 
	}

	function handleCanvasMouseUp() {
		if (!isPlaying || !isClicking) return;
		isClicking = false;

		if (levelFinished) {
			levelFinished = false; 
			if (gameMode === 'anxiety') {
				stopAnxietyCountdown(); // Stop countdown immediately when level is finished
				anxietyLevel++; // Increment levels completed ONLY on success
				// Save score and check for new personal best for anxiety mode if player is valid
				if (nickname.trim() !== '') {
					saveAnxietyScore(nickname, anxietyLevel);
				}
			}
			generateGameLogic(); 
		} else {
			// If mouse up and path is not complete and correct, it's a fail on the current attempt
			// Check if they drew anything, and if it's not the full correct path
			if (userClickedCells.length > 0 && !areArraysEqual(userClickedCells, drawnCells)) {
				console.log("Mouse up, path incorrect or incomplete -> fail");
				failedTryLogic();
			}
		}
	}
	
	function handleCanvasMouseMove(event: MouseEvent) {
		if (!isPlaying || !isClicking || !ctx || !canvasElement) return;

		const rect = canvasElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		let cellWidth = canvasElement.width / currentDifficulty;
		let cellHeight = canvasElement.height / currentDifficulty;
		let col = Math.floor(x / cellWidth);
		let row = Math.floor(y / cellHeight);

		// Store current mouse position
		lastMouseX = x;
		lastMouseY = y;

		if (row < 0 || row >= currentDifficulty || col < 0 || col >= currentDifficulty) {
			return; // Mouse is outside grid boundaries
		}
		
		const currentCellClicked: [number, number] = [row, col];

		// 1. If mouse is still in the very last cell that was painted, do nothing.
		if (userClickedCells.length > 0) {
			const lastPaintedCell = userClickedCells[userClickedCells.length - 1];
			if (lastPaintedCell[0] === currentCellClicked[0] && lastPaintedCell[1] === currentCellClicked[1]) {
				return; 
			}
		}

		// 2. Check if the current cell is part of the designated path.
		if (!drawnCells.some(cell => cell[0] === currentCellClicked[0] && cell[1] === currentCellClicked[1])) {
			console.log("Clicked outside path - fail");
			failedTryLogic(); 
			isClicking = false;
			return; 
		}

		// 3. Check if the user is trying to re-color a cell they've already colored in this attempt.
		//    (This check is now valid because we've already handled being in the *last* painted cell).
		if (userClickedCells.some(cell => cell[0] === currentCellClicked[0] && cell[1] === currentCellClicked[1])) {
			console.log("Clicked on an already colored cell (revisit) - fail");
			failedTryLogic();
			isClicking = false;
			return;
		}

		// 4. Process the new cell (it's on the path, not yet clicked, and not the same as the immediate last)
		// Adjacency check: Only if it's not the first cell being clicked.
		if (userClickedCells.length > 0) {
			const previousCell = userClickedCells[userClickedCells.length - 1]; // The cell they are coming FROM
			const dx = Math.abs(previousCell[1] - currentCellClicked[1]);
			const dy = Math.abs(previousCell[0] - currentCellClicked[0]);
			if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
				console.log("Skipped a cell - fail");
				failedTryLogic();
				isClicking = false;
				return;
			}
		}
		// Note: If it's the first cell (userClickedCells.length === 0),
		// it must be part of drawnCells (checked above), and no adjacency check is needed yet.

		ctx.fillStyle = userCellsColor;
		ctx.fillRect(currentCellClicked[1] * cellWidth, currentCellClicked[0] * cellHeight, cellWidth, cellHeight);
		userClickedCells.push(currentCellClicked);

		// 5. Check for level completion
		if (userClickedCells.length === drawnCells.length) {
			if (areArraysEqual(userClickedCells, drawnCells)) {
				console.log("Level Finished!");
				levelFinished = true; 
			} else {
				console.log("Path complete but incorrect - fail");
				failedTryLogic();
                isClicking = false;
			}
		}
	}

	function handleCanvasMouseOut() {
		if (isPlaying && isClicking) {
			console.log("Mouse out while clicking - fail");
			failedTryLogic(); 
            isClicking = false; 
		}
	}

	function areArraysEqual(arr1: number[][], arr2: number[][]): boolean {
		if (arr1.length !== arr2.length) return false;
		const sortFn = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
		const sortedArr1 = [...arr1].sort(sortFn);
		const sortedArr2 = [...arr2].sort(sortFn);
		for (let i = 0; i < sortedArr1.length; i++) {
			if (sortedArr1[i][0] !== sortedArr2[i][0] || sortedArr1[i][1] !== sortedArr2[i][1]) {
				return false;
			}
		}
		return true;
	}

	function resetCellsVisualization() {
		if (!ctx || !canvasElement) return;
		fillCanvas("#fff");
		drawGrid("#000", currentDifficulty, currentDifficulty, 1);
		for (let i = 0; i < drawnCells.length; i++) {
			colorCell(drawnCells[i][0], drawnCells[i][1], cellPathColor);
		}
	}
	
	function animateParticles(currentTime: DOMHighResTimeStamp) {
		if (!ctx) return;

		// Clear the canvas and redraw the grid and the path of the new level
		fillCanvas("#fff");
		drawGrid("#000", currentDifficulty, currentDifficulty, 1);
		for (const cell of drawnCells) {
			colorCell(cell[0], cell[1], cellPathColor);
		}

		// Update and draw explosion particles. If there are still particles, continue animation.
		if (updateAndDrawParticles(ctx)) {
			requestAnimationFrame(animateParticles);
		}
	}

	function failedTryLogic() {
		console.log("Attempt Failed!");

		// Reset user interaction and path immediately
		userClickedCells = [];
		levelFinished = false;
		isClicking = false;

		// Trigger explosion at the last known mouse position
		if (lastMouseX !== undefined && lastMouseY !== undefined) {
			createParticles(lastMouseX, lastMouseY, userCellsColor); // Use the imported function
			requestAnimationFrame(animateParticles); // Start animation loop if not already running
		}

		if (gameMode === "infinite") {
			console.log("Infinite mode: Total level completed:", currentLevel > 0 ? currentLevel -1 : 0);
			// For infinite, a fail means game over, go to lobby
			handleLobbyClick();
			return; // Important to stop further execution after fail in infinite
		} else if (gameMode === "speedrun") {
			console.log("Speedrun mode: Failed attempt at level", currentLevel);
			// In speedrun, a fail on a level means you have to retry that level.
			// Timer continues.
			stopTimer(); // Reset timer
			startTimer(); // Restart timer
			currentLevel = 0; // Reset to level 0, generateGameLogic will increment to 1
			
			userClickedCells = [];
			levelFinished = false;
			isClicking = false;

			// No delay needed, logic continues immediately
			generateGameLogic(); // Regenerate level (will be level 1)
			return; // Stop further execution for speedrun fail case
		} else if (gameMode === "training") {
			console.log(`Training mode: Failed attempt at difficulty ${currentDifficulty}, attempt ${currentLevel}`);
			currentLevel = 0; // Reset attempt counter, generateGameLogic will increment to 1
			userClickedCells = [];
			levelFinished = false;
			isClicking = false;

			// No delay needed, logic continues immediately
			// Regenerate the level (same difficulty, new path)
			generateGameLogic(); // This will use the existing currentDifficulty (selectedTrainingDifficulty)
			return;
		} else if (gameMode === "anxiety") {
			console.log(`Anxiety mode: Failed attempt at level ${anxietyLevel}`);
			// Game over for anxiety mode: show game over screen, save score if new high, then reset fully
			isPlaying = false; // Stop game interactions
			showGameOverScreen = true; // Show the game over UI immediately
			stopAnxietyCountdown(); // Stop countdown

			// Save score for anxiety mode if there's a nickname and levels were completed
			console.log(`Anxiety mode failed. Levels completed at time of failure: ${anxietyLevel}`);
			if (nickname.trim() !== '' && anxietyLevel > 0) {
				saveAnxietyScore(nickname, anxietyLevel);
			}
			return; // Stop further execution for anxiety fail case
		}
		
		resetCellsVisualization(); 
	}

	function handleResetClick() {
		if (!isPlaying) return;
		
		userClickedCells = [];
		levelFinished = false;
		isClicking = false;

		if (gameMode === "speedrun") {
			console.log("Back to nickname selection (from Back button in Speedrun)");
			stopTimer();
			isPlaying = false; // This will take the user back to the nickname input UI
			currentLevel = 0; // Reset level progress
			timerValue = 0; // Reset timer display

			// Clear canvas
			if (ctx && canvasElement) {
				ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
			}
		} else if (gameMode === "training") {
			console.log("Back to training difficulty selection (from Reset/Back button)");
			isPlaying = false; // This will take the user back to the difficulty selection UI
			currentLevel = 0; // Reset attempts count for the difficulty level

			// Clear canvas
			if (ctx && canvasElement) {
				ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
			}
		} else if (gameMode === "infinite") {
			console.log("Reset Clicked for Infinite");
			currentLevel = 0; // This will be incremented by generateGameLogic
			generateGameLogic();
		} else if (gameMode === "anxiety") {
			console.log("Back to lobby from Anxiety mode");
			isPlaying = false; // This will take the user back to the lobby
			anxietyLevel = 0; // Reset anxiety level
			currentDifficulty = ANXIETY_INITIAL_GRID_SIZE; // Reset grid size
			stopAnxietyCountdown(); // Stop countdown

			// Clear canvas
			if (ctx && canvasElement) {
				ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
			}
		} else {
			// Default for other modes if any
			console.log("Reset Clicked (default case)");
			resetCellsVisualization();
		}
	}

	function toggleRulesModal() {
		showRulesModal = !showRulesModal;
	}

	// --- Game Over Screen Handlers ---
	async function handlePlayAgainFromGameOver() {
		showGameOverScreen = false;
		personalBestRank = null;
		finalTimeActualRank = null;
		isNewPersonalBest = false;
		previousPersonalBestMs = null;
		finalTimeMs = 0;

		// Anxiety specific reset
		stopAnxietyCountdown();
		anxietyCountdownValue = ANXIETY_LEVEL_TIME_LIMIT;
		anxietyLevel = 0;

		// Reset game state for a new game
		isPlaying = true;
		currentLevel = 0; // Will be incremented to 1 by generateGameLogic
		timerValue = 0; // For speedrun mode

		await tick(); // Ensure DOM is updated if canvas needs to be re-rendered or accessed

		if (gameMode === 'speedrun') {
			startTimer();
			initGrid(5); // Initial difficulty for speedrun is 5
		} else if (gameMode === 'anxiety') {
			initGrid(ANXIETY_INITIAL_GRID_SIZE); // Initial grid size
		}
		// initGrid might not be strictly necessary if difficulty logic is self-contained in generateGameLogic
		// but good for consistency if it resets any visual state tied to difficulty.
		
		await generateGameLogic();
	}

	function handleLobbyFromGameOver() {
		showGameOverScreen = false; // Hide game over screen
		handleLobbyClick(); // Use existing lobby logic to reset fully
	}

	// Function to explicitly handle difficulty selection for training mode
	function selectTrainingDifficulty(size: number) {
		selectedTrainingDifficulty = size;
	}

	function startAnxietyCountdown() {
		stopAnxietyCountdown(); // Clear any existing countdown
		anxietyCountdownValue = ANXIETY_LEVEL_TIME_LIMIT; // Reset countdown

		anxietyCountdownInterval = window.setInterval(() => {
			anxietyCountdownValue--;
			if (anxietyCountdownValue <= 0) {
				stopAnxietyCountdown();
				// If countdown reaches 0 and game is still playing, it's a fail
				if (isPlaying && gameMode === 'anxiety') {
					console.log("Anxiety countdown ran out!");
					failedTryLogic();
				}
			}
		}, 1000); // Update every second
	}

	function stopAnxietyCountdown() {
		if (anxietyCountdownInterval !== undefined) {
			window.clearInterval(anxietyCountdownInterval);
			anxietyCountdownInterval = undefined;
		}
	}

	// --- Supabase functions for Anxiety scores --- START
	async function saveAnxietyScore(playerName: string, levelsCompleted: number) {
		if (!playerName) {
			console.log('Player name is empty, anxiety score not saved.');
			return;
		}
		const lowerPlayerName = playerName.toLowerCase();

		try {
			// Fetch the existing score
			const { data: existingScoreData, error: fetchError } = await supabase
				.from('anxiety_scores')
				.select('levels_completed')
				.eq('pseudo', lowerPlayerName)
				.single();

			if (fetchError && fetchError.code !== 'PGRST116') {
				console.error('Error fetching existing anxiety score:', fetchError);
				return;
			}

			const existingLevelsCompleted = existingScoreData?.levels_completed;

			// Compare and decide to update/insert
			if (existingLevelsCompleted === undefined || levelsCompleted > existingLevelsCompleted) {
				const { data, error: upsertError } = await supabase
					.from('anxiety_scores')
					.upsert({ pseudo: lowerPlayerName, levels_completed: levelsCompleted }, { onConflict: 'pseudo' });

				if (upsertError) {
					console.error('Error saving/updating anxiety score:', upsertError);
				} else {
					console.log('Anxiety score saved/updated:', data);
				}
			} else {
				console.log(`New anxiety score (${levelsCompleted} levels) is not better than existing score (${existingLevelsCompleted} levels) for ${lowerPlayerName}. Not updating.`);
			}
		} catch (error) {
			console.error('Exception in saveAnxietyScore:', error);
		}
	}

	async function fetchAnxietyScoreboard() {
		try {
			const { data, error } = await supabase
				.from('anxiety_scores')
				.select('id, pseudo, levels_completed, created_at')
				.order('levels_completed', { ascending: false })
				.limit(5);

			if (error) {
				console.error('Error fetching anxiety scoreboard:', error);
				anxietyScoreboardEntries = [];
			} else {
				anxietyScoreboardEntries = data as AnxietyScoreEntry[];
			}
		} catch (error) {
			console.error('Exception fetching anxiety scoreboard:', error);
			anxietyScoreboardEntries = [];
		}
	}
	// --- Supabase functions for Anxiety scores --- END

	onMount(async () => {
		if (browser) {
			loadKeybindFromStorage(); // Load saved keybind
			const storedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY);
			if (storedNickname) {
				nickname = storedNickname;
			}
			await fetchScoreboard(); // Fetch initial speedrun scoreboard data
			await fetchAnxietyScoreboard(); // Fetch initial anxiety scoreboard data

			speedrunScoresChannel = supabase
				.channel('speedrun_scores_changes')
				.on(
					'postgres_changes',
					{ event: '*', schema: 'public', table: 'speedrun_scores' },
					(payload) => {
						console.log('Speedrun Score change received!', payload);
						fetchScoreboard(); // Re-fetch speedrun scoreboard on any change
					}
				)
				.subscribe((status, err) => {
					if (status === 'SUBSCRIBED') {
						console.log('Subscribed to speedrun_scores changes!');
					} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
						console.error('Speedrun Score subscription error or timed out:', err, 'Status:', status);
					}
				});

			anxietyScoresChannel = supabase
				.channel('anxiety_scores_changes')
				.on(
					'postgres_changes',
					{ event: '*', schema: 'public', table: 'anxiety_scores' },
					(payload) => {
						console.log('Anxiety Score change received!', payload);
						fetchAnxietyScoreboard();
					}
				)
				.subscribe((status, err) => {
					if (status === 'SUBSCRIBED') {
						console.log('Subscribed to anxiety_scores changes!');
					} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
						console.error('Anxiety Score subscription error or timed out:', err, 'Status:', status);
					}
				});

			// Start polling for scoreboard updates
			scoreboardPollInterval = window.setInterval(async () => {
				await fetchScoreboard();
			}, 5000); // 5000 milliseconds = 5 seconds

			anxietyScoreboardPollInterval = window.setInterval(async () => {
				await fetchAnxietyScoreboard();
			}, 5000);

			window.addEventListener('keydown', handleGlobalKeyDown);
			window.addEventListener('keyup', handleGlobalKeyUp);
		}
	});

	onDestroy(() => {
		if (browser) {
			stopTimer();
			stopAnxietyCountdown(); // Ensure anxiety countdown is stopped

			if (speedrunScoresChannel) {
				supabase.removeChannel(speedrunScoresChannel)
					.then(() => console.log("Unsubscribed from speedrun_scores_changes"))
					.catch(err => console.error("Error unsubscribing:", err));
			}
			if (anxietyScoresChannel) {
				supabase.removeChannel(anxietyScoresChannel)
					.then(() => console.log("Unsubscribed from anxiety_scores_changes"))
					.catch(err => console.error("Error unsubscribing:", err));
			}
			// Clear the polling interval
			if (scoreboardPollInterval !== undefined) {
				window.clearInterval(scoreboardPollInterval);
			}
			if (anxietyScoreboardPollInterval !== undefined) {
				window.clearInterval(anxietyScoreboardPollInterval);
			}

			window.removeEventListener('keydown', handleGlobalKeyDown);
			window.removeEventListener('keyup', handleGlobalKeyUp);
		}
	});
</script>

<h1
	class="game-title {isPlaying ? 'in-game' : (gameMode === '' ? 'lobby lobby-title-slide-bounce' : 'lobby')}"
	bind:this={titleElement}
	on:mousemove={handleTitleMouseMove}
	on:mouseenter={handleTitleMouseEnter}
	on:mouseleave={handleTitleMouseLeave}
>
	Psychopath
	<span class="title-lit" style={flashlightStyle}>Psychopath</span>
</h1>

<!-- Structure HTML reprise de votre index.html original -->
<div class="scoreboard rubberBand">
	{#if gameMode === '' || gameMode === 'speedrun'}
		<h3>Scoreboard (Speedrun)</h3>
		{#if scoreboardEntries.length > 0}
			<ol>
				{#each scoreboardEntries as entry (entry.id)}
					<li>{entry.pseudo} : {formatTime(entry.time_ms)}</li>
				{/each}
			</ol>
		{:else}
			<p>No scores yet. Be the first!</p>
		{/if}
	{:else if gameMode === 'anxiety'}
		<h3>Scoreboard (Anxiety)</h3>
		{#if anxietyScoreboardEntries.length > 0}
			<ol>
				{#each anxietyScoreboardEntries as entry (entry.id)}
					<li>{entry.pseudo} : {entry.levels_completed} levels</li>
				{/each}
			</ol>
		{:else}
			<p>No scores yet. Be the first!</p>
		{/if}
	{/if}
</div>

<div class="difficulty">
	{#if !isPlaying && gameMode === ''}
		<div class="game-mode-selection-area" style="display: flex; flex-direction: column; align-items: center;">
			<div class="game-mode-row" style="display: flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
				<Button text="<" color="medium-blue" onClick={showPreviousMode} additionalClasses="swipe-arrow prev-arrow" animation="" />
				<div class="game-mode-swiper-item-container" style="display: flex; justify-content: center; align-items: center; width: 180px; /* Adjust width to fit one button */ position: relative; min-height: 50px; /* Ensure space for the button */ margin-left: 10px; margin-right: 10px;">
					{#key currentGameModeIndex}
						<div class="game-mode-item-wrapper"
							in:fly="{{ x: slideInX, duration: 300 }}"
							out:fly="{{ x: slideOutX, duration: 300 }}"
							style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; justify-content: center; align-items: center; width: 100%;">
							<Button
								text={gameModeOptions[currentGameModeIndex].text}
								color={gameModeOptions[currentGameModeIndex].color}
								onClick={selectDisplayedGameMode}
								animation=""
								additionalClasses="game-mode-main-button"
							/>
						</div>
					{/key}
				</div>
				<Button text=">" color="medium-blue" onClick={showNextMode} additionalClasses="swipe-arrow next-arrow" animation="" />
			</div>
			<div class="lobby-actions-column" style="display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 0px;">
				<Button text="Scoreboard" color="orange" href="/scoreboard" animation="" additionalClasses="lobby-action-button" />
				<Button text="Rules" color="blue" onClick={toggleRulesModal} animation="" additionalClasses="lobby-action-button" />
			</div>
		</div>
	{/if}

	{#if !isPlaying && gameMode !== ''}
		{#if gameMode === 'speedrun' || gameMode === 'anxiety'}
			<div class="nickname-container">
				<input
					type="text"
					class="difficulty-button game-button purple"
					value={nickname}
					on:input={handleNicknameInput}
					placeholder="Enter your nickname"
					maxlength="15"
				/>
				<Button text="OK" color="green" onClick={confirmSettingsAndStartGame} disabled={!isNicknameValid} animation="" />
			</div>
			<!-- Keybind Setting Button is moved below, next to color picker -->
		{:else if gameMode === 'training'}
			<div class="difficulty-selector-container">
				<span class="difficulty-selector-title color-list-title">Choose difficulty (grid size):</span>
				{#key selectedTrainingDifficulty}
					<div class="difficulty-buttons-wrapper">
						<div class="difficulty-buttons">
							{#each [5, 6, 8] as size (size)}
								<Button
									text={String(size)}
									color={selectedTrainingDifficulty === size ? 'red' : 'blue'}
									onClick={() => selectTrainingDifficulty(size)}
									additionalClasses="difficulty-choice-button"
									animation=""
								/>
							{/each}
						</div>
						<Button text="OK" color="green" onClick={confirmSettingsAndStartGame} animation="" />
					</div>
				{/key}
			</div>
		{/if}

		<!-- Common elements for Speedrun (after nickname) and Training (after difficulty selection) -->
		<div class="settings-row" style="display: flex; justify-content: space-around; align-items: flex-start; width: 100%; margin-top: 1.5rem;">
			<div class="color-list" style="flex-basis: 50%;">
				<span class="color-list-title">Choose your color</span>
				{#each availableColors as color}
					<button
						type="button"
						class="swatch {userCellsColor === color.value ? 'selected' : 'unselected'}"
						data-color={color.value}
						style="background: {color.display}; border: none; padding: 0; cursor: pointer;"
						on:click={() => handleColorSelect(color.value)}
						title={color.name}
						aria-label={color.name + " color"}
					></button>
				{/each}
			</div>

			<div class="keybind-container" style="flex-basis: 45%; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
				<span class="keybind-title color-list-title" style="margin-bottom: 0.5rem; text-align: center;">
					Alternative Draw Key <br/> (Left-click always works)
				</span>
				<Button
					text={isChangingKeybind ? 'Press a key...' : `Draw Key: ${currentKeybind}`}
					color="medium-blue"
					onClick={startChangeKeybindProcess}
					additionalClasses="keybind-button"
					animation=""
				/>
				{#if isChangingKeybind}
					<small class="color-list-title" style="color: #ccc; font-size: 0.8rem; text-align: center; display: inline-block; margin-top: 0.25rem;">Press any key to set it as your draw key.</small>
				{/if}
			</div>
		</div>
		<Button text="Lobby" color="orange" onClick={handleLobbyClick} animation="" />
	{/if}

	{#if isPlaying}
		<div class="inGameButtons">
			{#if gameMode === 'speedrun'}
				<Button text={formatTime(timerValue)} color="purple" animation="" disableHoverEffect={true} />
			{:else if gameMode === 'anxiety'}
				<Button text={`Countdown: ${anxietyCountdownValue}`} color="red" animation="" disableHoverEffect={true} />
			{/if}
			<Button text="Lobby" color="orange" onClick={handleLobbyClick} animation="" /> 
			{#if gameMode === 'training' || gameMode === 'anxiety'}
				<Button 
					text="Back" 
					color="blue" 
					onClick={handleResetClick} 
					animation="" 
				/> 
			{/if}
		</div>
	{/if}
</div>

<div class="game-info">
	{#if isPlaying}
		<!-- `currentLevel` is used for display in training/speedrun. For anxiety, we use `anxietyLevel` below. -->
		{#if gameMode !== 'anxiety'}
			<Button text="Level {currentLevel}" color="yellow" animation="" disableHoverEffect={true} additionalClasses="level difficulty-button" />
		{:else if gameMode === 'anxiety'}
			<Button text="Level {anxietyLevel + 1}" color="yellow" animation="" disableHoverEffect={true} additionalClasses="level difficulty-button" />
		{/if}
		<canvas 
			class="grid" 
			bind:this={canvasElement} 
			width="400" 
			height="400"
			on:mousedown={handleCanvasMouseDown}
			on:mouseup={handleCanvasMouseUp}
			on:mousemove={handleCanvasMouseMove}
			on:mouseout={handleCanvasMouseOut}
			on:blur={handleCanvasMouseOut}
			tabindex="0"
		></canvas> 
	{/if}
</div>

<!-- {#if isPlaying } 
	<div class="cross difficulty-button game-button red" style="display: none"> 
		<div class="cross-content heartBeat">❌</div>
	</div>
{/if} -->

{#if showRulesModal}
	<div 
		class="modal-backdrop" 
		on:click={toggleRulesModal}
		role="button"
		tabindex="0"
		on:keydown={handleModalBackdropKeydown(toggleRulesModal)}
		aria-label="Close rules modal"
	></div>
	<div class="modal {showRulesModal ? 'modal-box-bounce-animation is-visible' : 'modal-leave'}">
		<h2>Game Rules</h2>
		<p>
			The goal of the game is to <span class="rules-text-orange-outline">reproduce the highlighted path</span> on the grid.<br />
			<u>Click and drag</u> your mouse to draw your path.<br />
			- <strong><span class="rules-text-green-outline">Speedrun</span> :</strong> Complete 15 levels as fast as possible. Your time will be recorded on the scoreboard.<br />
			- <strong><span class="rules-text-blue-outline">Training</span> :</strong> Choose your grid size and practice as much as you want. Mistakes reset the current path.<br />
			- <strong><span class="rules-text-purple-outline">Infinite</span> :</strong> Play as many levels as you can. The difficulty increases randomly. <span class="rules-text-red-outline">(Coming soon!)</span><br /><br />
			- <strong><span class="rules-text-red-outline">Anxiety</span> :</strong> Start with a 2x2 grid. The grid size increases every level. You have 10 seconds per level. Fail, and you restart from 2x2.<br /><br />
			Be careful, any mistake will make you <span class="rules-text-lightred-outline">restart the game</span> (in Speedrun) or <span class="rules-text-red-outline">end the game</span> (in Infinite/Anxiety).
		</p>
		<Button text="Close" color="orange" onClick={toggleRulesModal} animation="" />
	</div>
{/if}

<!-- Game Over Screen for Speedrun -->
{#if showGameOverScreen && gameMode === 'speedrun'}
	<div 
		class="modal-backdrop" 
		on:click={handleLobbyFromGameOver}
		role="button"
		tabindex="0"
		on:keydown={handleModalBackdropKeydown(handleLobbyFromGameOver)}
		aria-label="Close game over modal"
	></div>
	<div class="modal game-over-modal {showGameOverScreen ? 'modal-box-bounce-animation is-visible' : 'modal-leave'}">
		<h2>Speedrun Complete!</h2>
		<p class="final-time">Your Time: {formatTime(finalTimeMs)}</p>
		{#if finalTimeActualRank !== null}
			<p class="final-time-rank">(This time's rank: {finalTimeActualRank})</p>
		{/if}
		
		{#if personalBestRank !== null}
			<p class="player-rank">Your Personal Best Rank: {personalBestRank}</p>
		{/if}

		{#if isNewPersonalBest}
			<p class="personal-best-new">🎉 New Personal Best! 🎉</p>
		{:else if previousPersonalBestMs !== null}
			<p class="personal-best-old">
				Not a new PB. Your best: {formatTime(previousPersonalBestMs)}
			</p>
		{/if}

		<div class="game-over-buttons">
			<Button text="Play Again" color="green" onClick={handlePlayAgainFromGameOver} animation="bounceInDown" />
			<Button text="Lobby" color="orange" onClick={handleLobbyFromGameOver} animation="bounceInDown" />
		</div>
	</div>
{/if}

<!-- Game Over Screen for Anxiety -->
{#if showGameOverScreen && gameMode === 'anxiety'}
	<div 
		class="modal-backdrop" 
		on:click={handleLobbyFromGameOver}
		role="button"
		tabindex="0"
		on:keydown={handleModalBackdropKeydown(handleLobbyFromGameOver)}
		aria-label="Close game over modal"
	></div>
	<div class="modal game-over-modal {showGameOverScreen ? 'modal-box-bounce-animation is-visible' : 'modal-leave'}">
		<h2>Anxiety Mode Game Over!</h2>
		<p class="final-time">Levels Completed: {anxietyLevel}</p>
		<!-- Optionally show rank here if implementing one for anxiety mode -->
		<div class="game-over-buttons">
			<Button text="Play Again" color="green" onClick={handlePlayAgainFromGameOver} animation="bounceInDown" />
			<Button text="Lobby" color="orange" onClick={handleLobbyFromGameOver} animation="bounceInDown" />
		</div>
	</div>
{/if}

<div class="footer-credit">
	Created by <a href="https://github.com/antaww" target="_blank" rel="noopener noreferrer">antaww</a>
</div>
