// Uno Game Logic Helper Functions

export type CardColor = 'red' | 'blue' | 'green' | 'yellow';
export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild_draw4';

export interface UnoCard {
  color: CardColor | null; // null for wild cards
  type: CardType;
  value?: number; // 0-9 for number cards
}

// Convert card to string format for storage
export function cardToString(card: UnoCard): string {
  if (card.type === 'wild') return 'WILD';
  if (card.type === 'wild_draw4') return 'WILD_D4';
  
  const colorCode = card.color!.charAt(0).toUpperCase();
  
  if (card.type === 'number') return `${colorCode}${card.value}`;
  if (card.type === 'skip') return `${colorCode}_SKIP`;
  if (card.type === 'reverse') return `${colorCode}_REV`;
  if (card.type === 'draw2') return `${colorCode}_D2`;
  
  return '';
}

// Convert string format back to card object
export function stringToCard(str: string): UnoCard {
  if (str === 'WILD') return { color: null, type: 'wild' };
  if (str === 'WILD_D4') return { color: null, type: 'wild_draw4' };
  
  const colorMap: { [key: string]: CardColor } = {
    'R': 'red',
    'B': 'blue',
    'G': 'green',
    'Y': 'yellow',
  };
  
  const colorCode = str.charAt(0);
  const color = colorMap[colorCode];
  
  if (str.includes('SKIP')) return { color, type: 'skip' };
  if (str.includes('REV')) return { color, type: 'reverse' };
  if (str.includes('D2')) return { color, type: 'draw2' };
  
  // It's a number card
  const value = parseInt(str.substring(1));
  return { color, type: 'number', value };
}

// Create a full Uno deck
export function createDeck(): string[] {
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
  const deck: string[] = [];
  
  // Add number cards (0-9, with 0 appearing once and 1-9 appearing twice per color)
  colors.forEach(color => {
    deck.push(cardToString({ color, type: 'number', value: 0 }));
    for (let i = 1; i <= 9; i++) {
      deck.push(cardToString({ color, type: 'number', value: i }));
      deck.push(cardToString({ color, type: 'number', value: i }));
    }
  });
  
  // Add action cards (2 of each per color)
  colors.forEach(color => {
    for (let i = 0; i < 2; i++) {
      deck.push(cardToString({ color, type: 'skip' }));
      deck.push(cardToString({ color, type: 'reverse' }));
      deck.push(cardToString({ color, type: 'draw2' }));
    }
  });
  
  // Add wild cards (4 of each)
  for (let i = 0; i < 4; i++) {
    deck.push(cardToString({ color: null, type: 'wild' }));
    deck.push(cardToString({ color: null, type: 'wild_draw4' }));
  }
  
  return deck;
}

// Shuffle array
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Check if a card can be played on top of another
export function canPlayCard(
  cardToPlay: string,
  currentCard: string,
  currentColor: string | null
): boolean {
  const playCard = stringToCard(cardToPlay);
  const topCard = stringToCard(currentCard);
  
  // Wild cards can always be played
  if (playCard.type === 'wild' || playCard.type === 'wild_draw4') {
    return true;
  }
  
  // If current card is wild, match the declared color
  if (topCard.type === 'wild' || topCard.type === 'wild_draw4') {
    return playCard.color === currentColor;
  }
  
  // Match color or match type/value
  if (playCard.color === topCard.color) return true;
  if (playCard.type === topCard.type && playCard.type !== 'number') return true;
  if (playCard.type === 'number' && topCard.type === 'number' && playCard.value === topCard.value) return true;
  
  return false;
}

// Get card display info
export function getCardDisplay(cardStr: string) {
  const card = stringToCard(cardStr);
  
  const colorClasses = {
    red: 'bg-red-600',
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    yellow: 'bg-yellow-500',
  };
  
  let display = '';
  let bgClass = 'bg-gray-900';
  
  if (card.type === 'wild') {
    display = 'WILD';
    bgClass = 'bg-gradient-to-br from-red-500 via-yellow-500 to-blue-500';
  } else if (card.type === 'wild_draw4') {
    display = '+4';
    bgClass = 'bg-gradient-to-br from-red-500 via-yellow-500 to-blue-500';
  } else {
    bgClass = colorClasses[card.color!] || 'bg-gray-600';
    
    if (card.type === 'number') {
      display = card.value!.toString();
    } else if (card.type === 'skip') {
      display = '🚫';
    } else if (card.type === 'reverse') {
      display = '↩️';
    } else if (card.type === 'draw2') {
      display = '+2';
    }
  }
  
  return { display, bgClass, card };
}
