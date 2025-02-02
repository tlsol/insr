def calculate_risk_score(stablecoin_data):
    # Simplified risk factors
    volatility = calculate_30d_volatility(stablecoin_data)
    market_cap = stablecoin_data['market_cap']
    return min(max(
        (volatility * 0.4 + (1 / market_cap) * 0.6) * 100,
        50
    ), 150) 