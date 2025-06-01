<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores'; // Corrected import
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte'; // Import the new Button component

	interface ScoreEntry {
		id: number;
		pseudo: string;
		time_ms: number;
		created_at: string;
	}

	let scoreboardEntries: ScoreEntry[] = [];
	let currentPage = 1;
	const itemsPerPage = 20;
	let totalPages = 1;
	let searchTerm = '';
	let loading = true;
	let displayEntries: ScoreEntry[] = [];
	let initialLoadComplete = false; // Added state

	async function fetchScoreboard(pageNumber = 1, search = '') {
		loading = true;
		const offset = (pageNumber - 1) * itemsPerPage;
		let query = supabase
			.from('speedrun_scores')
			.select('id, pseudo, time_ms, created_at', { count: 'exact' })
			.order('time_ms', { ascending: true });

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
				scoreboardEntries = data as ScoreEntry[];
				totalPages = Math.ceil((count || 0) / itemsPerPage);
				updateDisplayEntries();
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

	function updateDisplayEntries() {
		const newEntries = [...scoreboardEntries];
		while (newEntries.length < itemsPerPage) {
			newEntries.push({ id: -1, pseudo: '-', time_ms: -1, created_at: '' }); // Placeholder
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
			fetchScoreboard(currentPage, searchTerm);
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			fetchScoreboard(currentPage, searchTerm);
		}
	}

	function handleSearch() {
		currentPage = 1; // Reset to first page on new search
		fetchScoreboard(currentPage, searchTerm);
	}
	
	function goToLobby() {
		goto('/');
	}

	onMount(() => {
		fetchScoreboard(currentPage);
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
		<h1 class="scoreboard-title bounceInDown">Scoreboard</h1>
		<div class="scoreboard-table-container bounceInDown">
			{#if loading && initialLoadComplete}
				<!-- You could add a more subtle loading indicator here for searches if desired -->
				<!-- e.g., <div class="text-center p-4">Searching...</div> -->
			{/if}
			<table class="scoreboard-table">
				<thead>
					<tr>
						<th>Rank</th>
						<th>Name</th>
						<th>Time</th>
						<th>Date</th>
					</tr>
				</thead>
				<tbody>
					{#each displayEntries as entry, i}
						<tr>
							<td>{entry.pseudo === '-' ? '-' : (currentPage - 1) * itemsPerPage + i + 1}</td>
							<td>{entry.pseudo}</td>
							<td>{formatTime(entry.time_ms)}</td>
							<td>{formatDate(entry.created_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="pagination-controls bounceInDown">
		<Button text="Previous" color="blue" onClick={prevPage} disabled={currentPage <= 1 || loading} />
		<span>Page {currentPage} of {totalPages}</span>
		<Button text="Next" color="blue" onClick={nextPage} disabled={currentPage >= totalPages || loading} />
	</div>
</div>