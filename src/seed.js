// Starting catalogue, taken from the client's reference menu (descriptions verbatim
// from the supplied PDF). Rates are 0 until the business sets them in Menu.

export const DEFAULT_CATEGORIES = [
  { key: 'mocktail', name: 'Mocktail Reception', subtitle: 'Refreshing handcrafted non-alcoholic creations • Live Counter', accent: '#2F5D50', kind: 'menu' },
  { key: 'chaat', name: 'Chaat & Street-Food Atelier', subtitle: 'Indian favourites reimagined with a refined live-counter presentation', accent: '#C29A45', kind: 'menu' },
  { key: 'italian', name: 'Italian Live Kitchen', subtitle: 'Freshly finished pasta, bruschetta & artisanal breads', accent: '#8B1E3F', kind: 'menu' },
  { key: 'starters', name: 'Starters', subtitle: 'A selection of vibrant live-counter appetisers', accent: '#8B1E3F', kind: 'menu' },
  { key: 'main', name: 'Main Course', subtitle: 'A generous Indian feast of signature curries, rice & accompaniments', accent: '#1B2A41', kind: 'menu' },
  { key: 'breads', name: 'Indian Breads', subtitle: 'Freshly prepared accompaniments from the tandoor & tawa', accent: '#C29A45', kind: 'menu' },
  { key: 'salad', name: 'Salad Live Counters', subtitle: 'Freshly prepared Indian & Exotic salads • Live Counters', accent: '#2F5D50', kind: 'menu' },
  { key: 'dessert', name: 'Dessert Atelier', subtitle: 'A decadent finale of traditional Indian sweets & live indulgence', accent: '#8B1E3F', kind: 'menu' },
  { key: 'beverages', name: 'Beverages & Hospitality', subtitle: 'The finishing touches to your dining experience', accent: '#1B2A41', kind: 'menu' },
  { key: 'staff', name: 'Staff & Service', subtitle: 'Professional hospitality team for your event', accent: '#1B2A41', kind: 'service' },
  { key: 'equipment', name: 'Equipment & Décor', subtitle: 'Counters, crockery and presentation', accent: '#C29A45', kind: 'service' },
  { key: 'transport', name: 'Transport & Other Services', subtitle: 'Logistics and additional services', accent: '#2F5D50', kind: 'service' }
];

// [categoryKey, name, description, diet, unit]
export const DEFAULT_ITEMS = [
  ['mocktail', 'Signature Mocktails', 'A vibrant selection of chilled, colourful refreshments prepared fresh to order for a spirited welcome.', 'veg', 'Plate'],
  ['chaat', 'Paani Puri', 'Delicate crisp puris filled with spiced potato, finished with refreshing, tangy flavoured water.', 'veg', 'Plate'],
  ['chaat', 'Lucknowi Khasta Tikki', 'A golden, crisp potato tikki inspired by the aromatic and delicate flavours of Lucknow.', 'veg', 'Plate'],
  ['chaat', 'Dahi Bhalla Chaat', 'Soft lentil dumplings bathed in cool yogurt and finished with chutneys and fragrant spices.', 'veg', 'Plate'],
  ['chaat', 'Mumbaiya Bhel', 'A lively Mumbai-style medley of puffed rice, vegetables, chutneys and sev for a bright, crunchy finish.', 'veg', 'Plate'],
  ['italian', 'Cheese Saffron Pasta', 'Silky pasta enriched with creamy cheese and the luxurious floral aroma of saffron.', 'veg', 'Plate'],
  ['italian', 'Tomato Basil Pasta', 'Al dente pasta tossed in a vibrant tomato sauce and finished with fragrant basil.', 'veg', 'Plate'],
  ['italian', 'Cheese Corn Bruschetta', 'Golden toasted bread crowned with creamy cheese, sweet corn and savoury seasoning.', 'veg', 'Plate'],
  ['italian', 'Mushroom Bruschetta', 'Crisp toasted bread topped with richly seasoned mushrooms and earthy aromatics.', 'veg', 'Plate'],
  ['italian', 'Garlic Loaf', 'Warm, buttery bread infused with aromatic garlic, perfect for sharing.', 'veg', 'Plate'],
  ['starters', 'Mutton Seekh Kabab', 'Succulent minced mutton skewers, richly spiced and char-grilled until smoky and tender.', 'nonveg', 'Plate'],
  ['starters', 'Fish Koliwada', 'Crisp-fried fish in a spiced gram-flour batter, finished Koliwada style with a tangy chilli kick.', 'nonveg', 'Plate'],
  ['starters', 'Murgh Paras Kabab', 'Tender chicken kabab marinated in aromatic spices and grilled to a delicate golden finish.', 'nonveg', 'Plate'],
  ['starters', 'Dragon Chicken', 'Crispy chicken glazed in a bold, spicy and tangy Indo-Chinese-inspired sauce.', 'nonveg', 'Plate'],
  ['starters', 'Thai Pai Chicken', 'Tender chicken prepared with aromatic Thai-inspired seasoning and balanced sweet-spiced flavours.', 'nonveg', 'Plate'],
  ['starters', 'Paneer Lal Mirch Tikka', 'Char-grilled paneer marinated with aromatic spices and vibrant red chilli.', 'veg', 'Plate'],
  ['starters', 'American Crispy Corn', 'Crunchy sweet corn coated in a delicate seasoned crust for a light, addictive bite.', 'veg', 'Plate'],
  ['starters', 'Cheese Balls', 'Golden, crisp-fried balls with a soft, molten cheese centre.', 'veg', 'Plate'],
  ['main', 'Dum Chicken', 'Tender chicken slow-cooked on dum in a sealed pot with aromatic spices and fragrant herbs.', 'nonveg', 'Plate'],
  ['main', 'Chicken Biryani & Raita', 'Fragrant basmati rice layered with spiced chicken, served with cooling, creamy raita.', 'nonveg', 'Plate'],
  ['main', 'Paneer Lachhedar', 'Tender paneer in a rich, aromatic gravy with delicate layers of Indian spice.', 'veg', 'Plate'],
  ['main', 'Keema Veg Kasturi', 'A richly spiced vegetarian preparation with a keema-style texture and the distinctive fragrance of kasuri methi.', 'veg', 'Plate'],
  ['main', 'Dal Tadka', 'Comforting yellow lentils tempered with aromatic spices, garlic and herbs.', 'veg', 'Plate'],
  ['main', 'Jeera Rice', 'Long-grain basmati rice delicately tempered with fragrant cumin.', 'veg', 'Plate'],
  ['breads', 'Tandoori Roti', 'Traditional whole-wheat flatbread baked in the tandoor for a warm, lightly smoky finish.', 'veg', 'Nos'],
  ['breads', 'Rumali Roti', 'Paper-thin, soft handkerchief-style flatbread cooked fresh on an inverted tawa.', 'veg', 'Nos'],
  ['breads', 'Garlic Naan', 'Soft tandoor-baked naan brushed with butter and fragrant garlic.', 'veg', 'Nos'],
  ['salad', 'Indian Salad Counter', 'A colourful selection of fresh Indian-style salads, seasonal vegetables, herbs and vibrant accompaniments.', 'veg', 'Counter'],
  ['salad', 'Exotic Salad Counter', 'An elegant assortment of fresh, international-style salads featuring crisp vegetables, seasonal produce and refined dressings.', 'veg', 'Counter'],
  ['dessert', 'Sitaphal Rasmalai', 'Soft, saffron-infused rasmalai paired with the delicate sweetness and aroma of custard apple.', 'veg', 'Plate'],
  ['dessert', 'Rabdi Jalebi • Live', 'Crisp, syrup-soaked jalebi served warm with rich, velvety rabdi.', 'veg', 'Plate'],
  ['beverages', 'Coffee', 'Freshly prepared coffee service to conclude the evening on a warm, aromatic note.', 'veg', 'Cup'],
  ['beverages', 'Mineral Water • 200 ml', 'Chilled bottled mineral water served throughout the dinner.', 'veg', 'Bottle'],
  ['staff', 'Service Staff (Waiters)', 'Uniformed service staff for buffet and table service.', '', 'Person'],
  ['staff', 'Live Counter Chef', 'Dedicated chef to run a live counter during the event.', '', 'Person'],
  ['equipment', 'Buffet Counter Setup', 'Buffet counters with chafing dishes, linen and service ware.', '', 'Lot'],
  ['equipment', 'Premium Crockery & Cutlery', 'Premium crockery, glassware and cutlery for guests.', '', 'Pax'],
  ['transport', 'Transport & Logistics', 'Transport of food, equipment and staff to and from the venue.', '', 'Trip']
];

export const DEFAULT_SETTINGS = {
  id: 'main',
  brandLine1: "MUJAHID'S",
  brandLine2: 'STERLLING CATERRER',
  tagline: 'BESPOKE CATERING • SIGNATURE DINING',
  footerTagline: 'A CURATED DINING EXPERIENCE',
  closingLine: 'CRAFTED WITH CARE • SERVED WITH ELEGANCE',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  fssai: '',
  logo: '', // data URL
  colors: { navy: '#1B2A41', gold: '#C29A45', maroon: '#8B1E3F', cream: '#FBF4E6', green: '#2F5D50' },
  // Tax
  taxEnabled: false,
  taxes: [{ name: 'CGST', rate: 2.5 }, { name: 'SGST', rate: 2.5 }],
  roundOff: true,
  invoiceTitle: 'FINAL BILL', // or 'TAX INVOICE'
  // Numbering (separate sequences)
  quotePrefix: 'QT/',
  billPrefix: 'INV/',
  orderPrefix: 'ORD/',
  numberByFY: true,
  // Defaults
  quoteValidityDays: 15,
  billDueDays: 7,
  dateFormat: 'DD-MM-YYYY',
  showRatesInMenu: false,
  quoteTerms: '50% advance to confirm the booking; balance on or before the event day.\nFinal guest count to be confirmed 3 days before the event.\nPrices are valid until the validity date shown above.\nAny additional items or guests will be charged extra.',
  quoteInclusions: 'Food as per the menu above\nService staff in uniform\nBuffet counters, chafing dishes & serving ware',
  quoteExclusions: 'Venue, décor and electricity\nGovernment taxes unless shown above',
  billTerms: 'Please pay the balance by the due date.\nThank you for choosing us.',
  bankDetails: '',
  upiId: '',
  // POS
  posTaxEnabled: false,
  dineInEnabled: true,
  // Permissions
  cashierMaxDiscountPct: 5
};

export const ROLES = ['Owner', 'Manager', 'Cashier', 'Staff'];
