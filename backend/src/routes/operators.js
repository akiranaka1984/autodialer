// backend/src/routes/operators.js

const express = require('express');
const router = express.Router();
const operatorController = require('../controllers/operatorController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', operatorController.getAllOperators);
router.get('/:id/stats', operatorController.getOperatorStats);
router.put('/:id/status', operatorController.updateOperatorStatus);
router.post('/assign', operatorController.assignOperator);
router.put('/status', auth, operatorController.updateOperatorStatus);
router.post('/call/:action', auth, operatorController.handleCallAction);

module.exports = router;