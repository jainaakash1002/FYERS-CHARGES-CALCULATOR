const express = require("express");
const fileUpload = require("express-fileupload");
const csv = require("csv-parser");
const { Readable } = require("stream");
const app = express();
const cors = require("cors");
const PORT = 3500;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(fileUpload());

const convertCsvBufferToJson = (buffer) => {
  return new Promise((resolve, reject) => {
    const data = [];
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    stream
      .pipe(csv())
      .on("data", (row) => data.push(row))
      .on("end", () => resolve(data))
      .on("error", (err) => {
        console.error("Error parsing CSV:", err);
        reject(err);
      });
  });
};

const makeCalculations = (userFundsData, charges, globalpnl) => {
  const funds = userFundsData.reduce(
    (acc, obj) => {
      if (obj.voucher === "BR") {
        acc["BR"] += parseFloat(obj.credit_amount);
      } else if (obj.voucher === "JV") {
        acc["JV"] += parseFloat(obj.debit_amount);
      } else if (obj.voucher === "SJ") {
        acc["SJ"] += parseFloat(obj.debit_amount);
      }
      return acc;
    },
    {
      BR: 0,
      JV: 0,
      SJ: 0,
    }
  );

  const toadd = {
    expense: "Demat Transaction Charges",
    amount: funds["JV"],
  };

  charges.push(toadd);

  const totals = {
    totalRealized: 0,
    totalUnrealized: 0,
    brokerage: 0,
  };

  charges.forEach((item) => {
    totals.brokerage += item.amount;
  });

  globalpnl.forEach((item) => {
    totals.totalRealized += item.realised;
    totals.totalUnrealized += item.unrealised;
  });

  const summary =
    totals.totalRealized + totals.totalUnrealized - totals.brokerage;

  return {
    funds,
    charges,
    totals,
    summary,
  };
};

app.post("/upload", async (req, res) => {
  if (!req.files)
    return res
      .status(400)
      .send("No files were uploaded or files not in the expected format.");

  try {
    const results = [];
    let userFundsData = [];
    let pnlExpenseData = [];
    let globalPnLData = [];

    for (const file of req.files.file) {
      const jsonData = await convertCsvBufferToJson(file.data);
      results.push({ fileName: file.name, data: jsonData });

      if (file.name.includes("userfunds")) userFundsData = jsonData;
      else if (file.name.includes("PnlExpense")) pnlExpenseData = jsonData;
      else if (file.name.includes("Global P&L Statement"))
        globalPnLData = jsonData;
    }

    const updatedPnlExpenseData = pnlExpenseData.map((expense) => {
      return {
        expense: expense['﻿"Expenses"'],
        amount: parseFloat(expense["Amount (₹)"]),
      };
    });

    const updatedglobalPnLData = globalPnLData.map((expense) => {
      return {
        ...expense,
        realised: parseFloat(expense["Realized Profit/Loss  (₹)"]),
        unrealised: parseFloat(expense["Unrealized Profit/Loss  (₹)"]),
      };
    });

    const { funds, charges, totals, summary } = makeCalculations(
      userFundsData,
      updatedPnlExpenseData,
      updatedglobalPnLData
    );

    res.json({
      status: "success",
      message: "Data processed successfully",
      data: { funds, charges, totals, summary },
    });
  } catch (err) {
    console.error("Error processing files:", err);
    res
      .status(500)
      .json({ error: "Error processing files", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
