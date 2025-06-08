<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores'; // Corrected import
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte'; // Import the new Button component
	import { fly } from 'svelte/transition';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	// Interfaces for different scoreboard types
	interface SpeedrunScoreEntry {
		id: number;
		pseudo: string;
		time_ms: number;
		updated_at: string; // Changed from created_at to updated_at
	}

	interface AnxietyScoreEntry {
		id: number;
		pseudo: string;
		levels_completed: number;
		updated_at: string; // Changed from created_at to updated_at
	}

	// Type for scoreboard entries that can be either Speedrun or Anxiety
	type ScoreboardEntry = SpeedrunScoreEntry | AnxietyScoreEntry;

	let scoreboardEntries: ScoreboardEntry[] = [];
	let currentPage = 1;
	const itemsPerPage = 10;
	let totalPages = 1;
	let searchTerm = '';
	let loading = true;
	let displayEntries: ScoreboardEntry[] = [];
	let initialLoadComplete = false; // Added state

	// Supabase Realtime Channels and Polling Intervals
	let speedrunScoresChannel: RealtimeChannel | null = null;
	let anxietyScoresChannel: RealtimeChannel | null = null;
	let scoreboardPollInterval: number | undefined = undefined; // For polling
	let anxietyScoreboardPollInterval: number | undefined = undefined;

	// Game Mode Swiper Logic - START
	const gameModeOptions = [
		{ id: 'speedrun', text: 'Speedrun', color: 'green' as const, table: 'speedrun_scores', orderBy: 'time_ms', ascending: true, type: 'speedrun' },
		{ id: 'anxiety', text: 'Anxiety', color: 'red' as const, table: 'anxiety_scores', orderBy: 'levels_completed', ascending: false, type: 'anxiety' }
	] as const; // Add as const here

	let currentGameModeIndex = 0;
	let slideInX = 0; // Initial animation state (0 means no slide for the first item)
	let slideOutX = 0; // Initial animation state

	let currentMode = gameModeOptions[currentGameModeIndex];

	async function showNextMode() {
		slideInX = 300;    // New element enters from the right
		slideOutX = -300;  // Old element exits to the left
		await tick(); // Ensures DOM updates with new slide directions before index change
		currentGameModeIndex = (currentGameModeIndex + 1) % gameModeOptions.length;
		currentMode = gameModeOptions[currentGameModeIndex];
		currentPage = 1; // Reset to first page when changing mode
		searchTerm = ''; // Reset search term
		// No need for 'as' cast here if gameModeOptions is 'as const'
		await fetchScoreboard(currentPage, searchTerm, currentMode.table, currentMode.orderBy, currentMode.ascending, currentMode.type);
	}

	async function showPreviousMode() {
		slideInX = -300;   // New element enters from the left
		slideOutX = 300;   // Old element exits to the right
		await tick(); // Ensures DOM updates with new slide directions before index change
		currentGameModeIndex = (currentGameModeIndex - 1 + gameModeOptions.length) % gameModeOptions.length;
		currentMode = gameModeOptions[currentGameModeIndex];
		currentPage = 1; // Reset to first page when changing mode
		searchTerm = ''; // Reset search term
		// No need for 'as' cast here if gameModeOptions is 'as const'
		await fetchScoreboard(currentPage, searchTerm, currentMode.table, currentMode.orderBy, currentMode.ascending, currentMode.type);
	}
	// Game Mode Swiper Logic - END

	async function fetchScoreboard(
		pageNumber: number = 1,
		search: string = '',
		table: string,
		orderBy: string,
		ascending: boolean,
		modeType: 'speedrun' | 'anxiety'
	) {
		loading = true;
		const offset = (pageNumber - 1) * itemsPerPage;
		let query = supabase
			.from(table)
			.select(`id, pseudo, ${orderBy}, updated_at`, { count: 'exact' }) // Select updated_at
			.order(orderBy, { ascending: ascending });

		if (search) {
			query = query.ilike('pseudo', `%${search}%`);
		}

		query = query.range(offset, offset + itemsPerPage - 1);

		try {
			const { data, error, count } = await query;

			if (error) {
				console.error('Error fetching scoreboard:', error);
				scoreboardEntries = [];
				displayEntries = [];
			} else {
				// Type assertion for scoreboard entries based on modeType
				if (modeType === 'speedrun') {
					scoreboardEntries = data as unknown as SpeedrunScoreEntry[];
				} else {
					scoreboardEntries = data as unknown as AnxietyScoreEntry[];
				}
				totalPages = Math.ceil((count || 0) / itemsPerPage);
				updateDisplayEntries(modeType); // Pass modeType to updateDisplayEntries
			}
		} catch (error) {
			console.error('Exception fetching scoreboard:', error);
			scoreboardEntries = [];
			displayEntries = [];
		} finally {
			loading = false;
			if (!initialLoadComplete) { // Update initialLoadComplete
				initialLoadComplete = true;
			}
		}
	}

	function updateDisplayEntries(modeType: 'speedrun' | 'anxiety') {
		const newEntries: ScoreboardEntry[] = [...scoreboardEntries];
		while (newEntries.length < itemsPerPage) {
			if (modeType === 'speedrun') {
				newEntries.push({ id: -1, pseudo: '-', time_ms: -1, updated_at: '' }); // Placeholder for Speedrun
			} else {
				newEntries.push({ id: -1, pseudo: '-', levels_completed: -1, updated_at: '' }); // Placeholder for Anxiety
			}
		}
		displayEntries = newEntries;
	}

	function formatTime(ms: number): string {
		if (ms === -1) return '-';
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

	function formatLevels(levels: number): string {
		if (levels === -1) return '-';
		return String(levels);
	}

	function formatDate(dateString: string): string {
		if (!dateString) return '-';
		const date = new Date(dateString);
		const day = String(date.getDate()).padStart(2, '0');
		const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
		const year = date.getFullYear();
		return `${day}/${month}/${year}`;
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			const mode = gameModeOptions[currentGameModeIndex];
			fetchScoreboard(currentPage, searchTerm, mode.table, mode.orderBy, mode.ascending, mode.type);
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			const mode = gameModeOptions[currentGameModeIndex];
			fetchScoreboard(currentPage, searchTerm, mode.table, mode.orderBy, mode.ascending, mode.type);
		}
	}

	function handleSearch() {
		currentPage = 1; // Reset to first page on new search
		const mode = gameModeOptions[currentGameModeIndex];
		fetchScoreboard(currentPage, searchTerm, mode.table, mode.orderBy, mode.ascending, mode.type);
	}
	
	function goToLobby() {
		goto('/');
	}

	onMount(() => {
		const mode = gameModeOptions[currentGameModeIndex];
		fetchScoreboard(currentPage, searchTerm, mode.table, mode.orderBy, mode.ascending, mode.type);

		// Supabase Realtime Subscriptions
		speedrunScoresChannel = supabase
			.channel('scoreboard_speedrun_changes') // Use a unique channel name
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'speedrun_scores' },
				(payload) => {
					console.log('Speedrun Scoreboard change received!', payload);
					const current = gameModeOptions[currentGameModeIndex];
					if (current.type === 'speedrun') {
						fetchScoreboard(currentPage, searchTerm, current.table, current.orderBy, current.ascending, current.type);
					}
				}
			)
			.subscribe((status, err) => {
				if (status === 'SUBSCRIBED') {
					console.log('Subscribed to scoreboard_speedrun_changes!');
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					console.error('Speedrun Scoreboard subscription error or timed out:', err, 'Status:', status);
				}
			});

		anxietyScoresChannel = supabase
			.channel('scoreboard_anxiety_changes') // Use a unique channel name
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'anxiety_scores' },
				(payload) => {
					console.log('Anxiety Scoreboard change received!', payload);
					const current = gameModeOptions[currentGameModeIndex];
					if (current.type === 'anxiety') {
						fetchScoreboard(currentPage, searchTerm, current.table, current.orderBy, current.ascending, current.type);
					}
				}
			)
			.subscribe((status, err) => {
				if (status === 'SUBSCRIBED') {
					console.log('Subscribed to scoreboard_anxiety_changes!');
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					console.error('Anxiety Scoreboard subscription error or timed out:', err, 'Status:', status);
				}
			});

		// Start polling for scoreboard updates (fallback/redundancy)
		scoreboardPollInterval = window.setInterval(async () => {
			const current = gameModeOptions[currentGameModeIndex];
			await fetchScoreboard(currentPage, searchTerm, current.table, current.orderBy, current.ascending, current.type);
		}, 5000); // 5000 milliseconds = 5 seconds

		anxietyScoreboardPollInterval = window.setInterval(async () => {
			const current = gameModeOptions[currentGameModeIndex];
			await fetchScoreboard(currentPage, searchTerm, current.table, current.orderBy, current.ascending, current.type);
		}, 5000);
	});

	onDestroy(() => {
		// Clear the polling interval
		if (scoreboardPollInterval !== undefined) {
			window.clearInterval(scoreboardPollInterval);
		}
		if (anxietyScoreboardPollInterval !== undefined) {
			window.clearInterval(anxietyScoreboardPollInterval);
		}
		// Unsubscribe from Supabase channels
		if (speedrunScoresChannel) {
			supabase.removeChannel(speedrunScoresChannel)
				.then(() => console.log("Unsubscribed from scoreboard_speedrun_changes"))
				.catch(err => console.error("Error unsubscribing from speedrun channel:", err));
		}
		if (anxietyScoresChannel) {
			supabase.removeChannel(anxietyScoresChannel)
				.then(() => console.log("Unsubscribed from scoreboard_anxiety_changes"))
				.catch(err => console.error("Error unsubscribing from anxiety channel:", err));
		}
	});
</script>

<svelte:head>
	<title>Scoreboard</title>
	<link rel="stylesheet" href="/styles/index.css" />
</svelte:head>

<div class="container scoreboard-page">
	<div class="scoreboard-controls bounceInDown">
		<Button text="Lobby" color="orange" onClick={goToLobby} />
		
		<div class="search-container">
			<input
				bind:value={searchTerm}
				class="difficulty-button game-button purple"
				maxlength="15"
				on:keyup={(e) => e.key === 'Enter' && handleSearch()}
				placeholder="Search by name..."
				type="text"
			/>
			<Button text="Search" color="green" onClick={handleSearch} />
		</div>
	</div>

	{#if !initialLoadComplete && loading}
		<div class="loading-text bounceInDown">Loading scores...</div>
	{:else}
		<h1 class="scoreboard-title bounceInDown">{currentMode.text} Scoreboard</h1>
		<div class="scoreboard-display-area" style="display: flex; align-items: center; justify-content: center; width: 100%;">
			<Button text="<" color="medium-blue" onClick={showPreviousMode} additionalClasses="swipe-arrow prev-arrow" animation="" />
			<div class="scoreboard-table-container bounceInDown" style="flex-grow: 1;">
				{#if loading && initialLoadComplete}
					<!-- You could add a more subtle loading indicator here for searches if desired -->
					<!-- e.g., <div class="text-center p-4">Searching...</div> -->
				{/if}
				<table class="scoreboard-table">
					<thead>
						<tr>
							<th>Rank</th>
							<th>Name</th>
							<th>{currentMode.type === 'speedrun' ? 'Time' : 'Levels'}</th>
							<th>Date</th>
						</tr>
					</thead>
					<tbody>
						{#each displayEntries as entry, i}
							<tr>
								<td>{entry.pseudo === '-' ? '-' : (currentPage - 1) * itemsPerPage + i + 1}</td>
								<td>{entry.pseudo}</td>
								<td>
									{#if currentMode.type === 'speedrun'}
										{formatTime((entry as SpeedrunScoreEntry).time_ms)}
									{:else}
										{formatLevels((entry as AnxietyScoreEntry).levels_completed)}
									{/if}
								</td>
								<td>{formatDate(entry.updated_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<Button text=">" color="medium-blue" onClick={showNextMode} additionalClasses="swipe-arrow next-arrow" animation="" />
		</div>
	{/if}

	<div class="pagination-controls bounceInDown">
		<Button text="<" color="medium-blue" onClick={prevPage} disabled={currentPage <= 1 || loading} />
		<span>Page {currentPage} of {totalPages}</span>
		<Button text=">" color="medium-blue" onClick={nextPage} disabled={currentPage >= totalPages || loading} />
	</div>
</div>