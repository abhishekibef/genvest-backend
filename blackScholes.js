// Standard normal CDF (required for Black-Scholes)
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

// Core Black-Scholes pricing
export function blackScholesPrice(spot, strike, daysToExpiry, volatility, riskFreeRate, type) {
  if (daysToExpiry <= 0) {
    const intrinsicValue = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    return {
      premium: intrinsicValue,
      delta: type === 'CE' ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0),
      theta: 0,
      gamma: 0,
      vega: 0,
      intrinsicValue,
      timeValue: 0
    };
  }

  const T = daysToExpiry / 365;
  const d1 = (Math.log(spot / strike) + (riskFreeRate + (volatility * volatility) / 2) * T) / (volatility * Math.sqrt(T));
  const d2 = d1 - volatility * Math.sqrt(T);

  let premium, delta, theta, gamma, vega;

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const N_minus_d1 = normalCDF(-d1);
  const N_minus_d2 = normalCDF(-d2);
  const N_prime_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);

  if (type === 'CE') {
    premium = spot * Nd1 - strike * Math.exp(-riskFreeRate * T) * Nd2;
    delta = Nd1;
    theta = -(spot * N_prime_d1 * volatility) / (2 * Math.sqrt(T)) - riskFreeRate * strike * Math.exp(-riskFreeRate * T) * Nd2;
  } else {
    premium = strike * Math.exp(-riskFreeRate * T) * N_minus_d2 - spot * N_minus_d1;
    delta = Nd1 - 1;
    theta = -(spot * N_prime_d1 * volatility) / (2 * Math.sqrt(T)) + riskFreeRate * strike * Math.exp(-riskFreeRate * T) * N_minus_d2;
  }

  gamma = N_prime_d1 / (spot * volatility * Math.sqrt(T));
  vega = spot * Math.sqrt(T) * N_prime_d1;

  // Convert theta and vega to per day / per 1% change
  theta = theta / 365;
  vega = vega / 100;

  const intrinsicValue = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const timeValue = Math.max(0, premium - intrinsicValue);

  return { premium, delta, theta, gamma, vega, intrinsicValue, timeValue };
}

export const INDEX_CONFIG = {
  NIFTY: { lotSize: 25, strikeStep: 50, iv: 0.14, name: 'NIFTY 50' },
  BANKNIFTY: { lotSize: 15, strikeStep: 100, iv: 0.18, name: 'Bank NIFTY' }
};

export function generateOptionChain(underlying, spotPrice, expiryDate) {
  const config = INDEX_CONFIG[underlying] || INDEX_CONFIG['NIFTY'];
  const { lotSize, strikeStep, iv } = config;
  const riskFreeRate = 0.065;

  const atmStrike = Math.round(spotPrice / strikeStep) * strikeStep;
  
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysToExpiry = Math.max(0, (expiry - now) / (1000 * 60 * 60 * 24));

  const chain = [];
  for (let i = -10; i <= 10; i++) {
    const strike = atmStrike + i * strikeStep;
    const call = blackScholesPrice(spotPrice, strike, daysToExpiry, iv, riskFreeRate, 'CE');
    const put = blackScholesPrice(spotPrice, strike, daysToExpiry, iv, riskFreeRate, 'PE');
    chain.push({ strike, call, put });
  }

  return { underlying, spotPrice, expiry: expiryDate, lotSize, strikeStep, chain };
}

export function getNextWeeklyExpiry() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 4 = Thursday
  
  let daysUntilThursday = (4 - day + 7) % 7;
  
  if (daysUntilThursday === 0) {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    if (hours > 15 || (hours === 15 && minutes >= 30)) {
      daysUntilThursday = 7;
    }
  }

  const nextExpiry = new Date(now);
  nextExpiry.setDate(now.getDate() + daysUntilThursday);
  nextExpiry.setHours(15, 30, 0, 0); 
  
  return nextExpiry.toISOString().split('T')[0];
}

export function getUpcomingExpiries(count = 4) {
  const expiries = [];
  const nextExpiryStr = getNextWeeklyExpiry();
  let currentExpiry = new Date(nextExpiryStr);
  
  for (let i = 0; i < count; i++) {
    expiries.push(currentExpiry.toISOString().split('T')[0]);
    currentExpiry.setDate(currentExpiry.getDate() + 7);
  }
  
  return expiries;
}
