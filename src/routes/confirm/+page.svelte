<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let status: 'verifying' | 'success' | 'error' | 'redirecting' | 'can_close' = 'verifying';
	let errorMessage = '';

	const CHANNEL_NAME = 'stellar-auth-channel';
	const FOCUS_TIMEOUT_MS = 500;

	onMount(async () => {
		// Get the token from URL (Supabase adds these params)
		const tokenHash = $page.url.searchParams.get('token_hash');
		const type = $page.url.searchParams.get('type');

		// If this is a confirmation callback from Supabase
		if (tokenHash && type) {
			try {
				// Import supabase client
				const { supabase } = await import('$lib/supabase/client');

				// Verify the OTP token
				const { error } = await supabase.auth.verifyOtp({
					token_hash: tokenHash,
					type: type as 'signup' | 'email'
				});

				if (error) {
					status = 'error';
					// Provide user-friendly error messages for common cases
					const errorLower = error.message.toLowerCase();
					if (errorLower.includes('already') || errorLower.includes('confirmed') || errorLower.includes('used')) {
						errorMessage = 'This email has already been confirmed. You can sign in to your account.';
					} else if (errorLower.includes('expired') || errorLower.includes('invalid')) {
						errorMessage = 'This confirmation link has expired. Please request a new one from the login page.';
					} else {
						errorMessage = error.message;
					}
					return;
				}

				status = 'success';

				// Small delay to show success state
				await new Promise((resolve) => setTimeout(resolve, 800));

				// Try to focus existing app tab or redirect
				await focusOrRedirect();
			} catch (err) {
				status = 'error';
				errorMessage = 'An unexpected error occurred. Please try again.';
			}
		} else {
			// No token, just try to focus or redirect
			await focusOrRedirect();
		}
	});

	async function focusOrRedirect() {
		status = 'redirecting';

		// Try to communicate with existing app tabs using BroadcastChannel
		if ('BroadcastChannel' in window) {
			const channel = new BroadcastChannel(CHANNEL_NAME);
			let receivedResponse = false;

			// Listen for response from existing tab
			channel.onmessage = (event) => {
				if (event.data.type === 'TAB_PRESENT') {
					receivedResponse = true;
					channel.close();
					// Try to close this tab - if it fails, show "you can close this tab" message
					try {
						window.close();
					} catch {
						// Ignore close errors
					}
					// If we're still here after a short delay, window.close() failed
					setTimeout(() => {
						status = 'can_close';
					}, 100);
				}
			};

			// Ask if any app tab is open, and tell it auth was confirmed so it can refresh
			channel.postMessage({ type: 'FOCUS_REQUEST', from: 'confirm', authConfirmed: true });

			// Wait for response
			await new Promise((resolve) => setTimeout(resolve, FOCUS_TIMEOUT_MS));

			channel.close();

			// If no response, no existing tab is open - redirect this tab to home
			if (!receivedResponse) {
				goto('/', { replaceState: true });
			}
		} else {
			// BroadcastChannel not supported, just redirect
			goto('/', { replaceState: true });
		}
	}
</script>

<svelte:head>
	<title>Confirming... - Stellar</title>
</svelte:head>

<div class="confirm-page">
	<!-- Background -->
	<div class="background">
		<div class="void"></div>
		<div class="stars"></div>
		<div class="nebula nebula-1"></div>
		<div class="nebula nebula-2"></div>
	</div>

	<!-- Content -->
	<div class="content">
		<div class="card">
			{#if status === 'verifying'}
				<div class="icon spinning">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 2v4m0 12v4m-8-10h4m12 0h4m-5.66-5.66l-2.83 2.83m-5.02 5.02l-2.83 2.83m0-11.32l2.83 2.83m5.02 5.02l2.83 2.83" />
					</svg>
				</div>
				<h1>Verifying your email...</h1>
				<p>Please wait while we confirm your account.</p>
			{:else if status === 'success'}
				<div class="icon success">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<h1>Email Verified!</h1>
				<p>Your account has been confirmed. Redirecting you to Stellar...</p>
			{:else if status === 'redirecting'}
				<div class="icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
						<path d="M12 7v5l3 3" />
					</svg>
				</div>
				<h1>Taking you to Stellar...</h1>
				<p>Just a moment...</p>
			{:else if status === 'can_close'}
				<div class="icon success">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<h1>You're all set!</h1>
				<p>Your email is verified. You can close this tab and return to Stellar.</p>
			{:else if status === 'error'}
				<div class="icon error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
				</div>
				<h1>Verification Failed</h1>
				<p class="error-message">{errorMessage}</p>
				<a href="/login" class="btn">Go to Login</a>
			{/if}
		</div>
	</div>
</div>

<style>
	.confirm-page {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	/* Background */
	.background {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.void {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, #0a0a14 0%, #050510 100%);
	}

	.stars {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(2px 2px at 20px 30px, #f0f0ff, transparent),
			radial-gradient(2px 2px at 40px 70px, rgba(108, 92, 231, 0.8), transparent),
			radial-gradient(1px 1px at 90px 40px, #f0f0ff, transparent),
			radial-gradient(2px 2px at 130px 80px, rgba(255, 121, 198, 0.6), transparent),
			radial-gradient(1px 1px at 160px 120px, #f0f0ff, transparent);
		background-size: 200px 200px;
		animation: twinkle 4s ease-in-out infinite;
	}

	.nebula {
		position: absolute;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.4;
		animation: pulse 8s ease-in-out infinite;
	}

	.nebula-1 {
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, rgba(108, 92, 231, 0.6) 0%, transparent 70%);
		top: 20%;
		left: 10%;
	}

	.nebula-2 {
		width: 300px;
		height: 300px;
		background: radial-gradient(circle, rgba(255, 121, 198, 0.5) 0%, transparent 70%);
		bottom: 20%;
		right: 15%;
		animation-delay: -4s;
	}

	@keyframes twinkle {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.4;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.5;
		}
	}

	/* Content */
	.content {
		position: relative;
		z-index: 1;
		padding: 20px;
	}

	.card {
		background: linear-gradient(
			165deg,
			rgba(15, 15, 30, 0.95) 0%,
			rgba(20, 20, 40, 0.9) 100%
		);
		border: 1px solid rgba(108, 92, 231, 0.25);
		border-radius: 24px;
		padding: 48px;
		text-align: center;
		max-width: 400px;
		backdrop-filter: blur(24px);
		box-shadow:
			0 32px 80px rgba(0, 0, 0, 0.5),
			0 0 0 1px rgba(255, 255, 255, 0.03) inset,
			0 0 100px rgba(108, 92, 231, 0.1);
	}

	.icon {
		width: 64px;
		height: 64px;
		margin: 0 auto 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(
			135deg,
			rgba(108, 92, 231, 0.2) 0%,
			rgba(255, 121, 198, 0.15) 100%
		);
		border-radius: 50%;
		color: var(--color-primary, #6c5ce7);
	}

	.icon svg {
		width: 32px;
		height: 32px;
	}

	.icon.spinning svg {
		animation: spin 1.5s linear infinite;
	}

	.icon.success {
		background: linear-gradient(
			135deg,
			rgba(38, 222, 129, 0.2) 0%,
			rgba(0, 212, 255, 0.15) 100%
		);
		color: var(--color-success, #26de81);
	}

	.icon.error {
		background: linear-gradient(
			135deg,
			rgba(255, 107, 107, 0.2) 0%,
			rgba(255, 121, 198, 0.15) 100%
		);
		color: var(--color-red, #ff6b6b);
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	h1 {
		margin: 0 0 12px;
		font-size: 24px;
		font-weight: 600;
		color: var(--color-text, #f0f0ff);
		letter-spacing: -0.3px;
	}

	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--color-text-secondary, #c8c8e0);
	}

	.error-message {
		color: var(--color-red, #ff6b6b);
		margin-bottom: 24px;
	}

	.btn {
		display: inline-block;
		margin-top: 8px;
		padding: 12px 32px;
		background: linear-gradient(135deg, #6c5ce7 0%, #8b7cf0 100%);
		color: #ffffff;
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
		border-radius: 12px;
		transition: all 0.2s ease;
	}

	.btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(108, 92, 231, 0.4);
	}
</style>
