
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const ordersRouter = require('./routes/orders');
const ingredientsRouter = require('./routes/ingredients');
const purchasesRouter = require('./routes/purchases');
const menuRouter = require('./routes/menu_items');


const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/restaurant'
});

// attach pool to req
app.use((req, res, next) => { req.db = pool; next(); });

app.use('/api/orders', ordersRouter);
app.use('/api/ingredients', ingredientsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/menu_items', menuRouter);


app.get('/api/health', (req, res) => res.json({ok:true}));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Backend running on port', PORT));
