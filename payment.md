// Step 1 - Project setup
npm init -y

// Step 2 - Package installation
npm install flutterwave-node-v3 dotenv

// Step 3 - Update the `.env` file with the keys
FLW_SECRET_KEY=<your_secret_key_here>
FLW_PUBLIC_KEY=<your_public_key_here>

// Step 4 - Update the `app.js` file
const Flutterwave = require('flutterwave-node-v3');
require('dotenv').config();

const flw = new Flutterwave(
	process.env.FLW_PUBLIC_KEY,
	process.env.FLW_SECRET_KEY
);

// Dummy data for the process
const dummyData = {
	country: 'NG',
	account_number: '0690000031',
	bank_name: 'Access Bank', // Bank code, e.g., GTBank for Nigeria
	amount: 10000,
	narration: 'Payment for services rendered',
	currency: 'NGN',
	reference: 'unique-transfer-ref-9p8',
	transfer_id: null, // This will store the transfer ID from the created transfer
	transaction_id: null, // This will store the transaction ID
	account_name: 'Forrest Green',
};

const runFullTransferFlow = async () => {
	try {
	} catch (error) {
		console.error(
			'Error during transfer flow:',
			error.response ? error.response.data : error
		);
	}
};

runFullTransferFlow();



const runFullTransferFlow = async () => {
	try {
    // Step 5 - Get bank code
		console.log('Fetching Bank List...');
		const bankCodeResponse = await flw.Bank.country({
			country: dummyData.country,
			account_bank: dummyData.bank_name,
		});
		console.log(bankCodeResponse);

		// Filter the bank list for the bank with the name "Access Bank"
		const selectedBank = bankCodeResponse.data.find(
			(bank) => bank.name === dummyData.bank_name
		);

		if (!selectedBank) {
			throw new Error(
				`Bank code with name ${dummyData.bank_name} not found`
			);
		}

		console.log(
			`Bank Found: ${selectedBank.name} with code ${selectedBank.code}`
		);
    
    // Step 6 - Get account details and validate
    console.log('Verifying Account Details...');
		const resolveAccountResponse = await flw.Misc.verify_Account({
			account_number: dummyData.account_number,
			account_bank: selectedBank.code,
		});
		console.log('Account Verified:', resolveAccountResponse);
    
    //Step 7 - Initiate the transfer
    console.log('Initiating Transfer...');
		const transferResponse = await flw.Transfer.initiate({
			account_bank: selectedBank.code,
			account_number: dummyData.account_number,
			amount: dummyData.amount,
			narration: dummyData.narration,
			currency: dummyData.currency,
			reference: dummyData.reference,
			callback_url: 'https://example.com/callback',
			debit_currency: 'NGN',
		});
		console.log('Transfer Initiated:', transferResponse);

		// Save the transfer ID for future steps
		dummyData.transfer_id = transferResponse.data.id;
    
		// Step 8 - Fetch the transfer data
    console.log("Fetching Transfer Details...");
    const fetchTransferResponse = await flw.Transfer.get_a_transfer({ id: dummyData.transfer_id });
    console.log("Transfer Details:", fetchTransferResponse);
    
    // Step 9 - Verify the transaction
    console.log('Verifying Transaction Details...');

		// Compare important fields from the response to your dummy data
		const matches =
			fetchTransferResponse.data.account_number ===
				dummyData.account_number &&
			fetchTransferResponse.data.amount === dummyData.amount &&
			fetchTransferResponse.data.narration === dummyData.narration &&
			fetchTransferResponse.data.reference === dummyData.reference &&
			fetchTransferResponse.data.currency === dummyData.currency &&
			fetchTransferResponse.data.full_name === dummyData.account_name; // Add any other necessary fields

		// Output the result of the comparison
		console.log(matches);

		// Conditional logic to determine if the transaction details match
		if (matches) {
			console.log(
				'Transaction details match with dummy data. Verification successful.'
			);
		} else {
			console.log(
				'Transaction details do not match with dummy data. Verification failed.'
			);
		}
    
	} catch (error) {
		console.error(
			'Error during transfer flow:',
			error.response ? error.response.data : error
		);
	}
};


// Step 10 - Run the application
node app.js

SUBSCRIPTION
We recommend reading the main readme first, to understand the requirements for using the library and how to initiate this in your apps. This guide assumes you've read that.

Manage User subscriptions via any of these methods:

Get all Subscriptions
Fetch a Subscription
Cancel a Subscription
Activate a Subscription
Get all subscriptions
This describes how to get all subscriptions

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY  );
const fetchSubscription = async () => {

    try {
        
        const response = await flw.Subscription.fetch_all()
        console.log(response);
    } catch (error) {
        console.log(error)
    }

fetchSubscription();
Sample Response

{
  "status": "success",
  "message": "Plan subscriptions fetched",
  "meta": {
    "page_info": {
      "total": 2,
      "current_page": 1,
      "total_pages": 1
    }
  },
  "data": [
    {
      "id": 4147,
      "amount": 2000,
      "customer": {
        "id": 247546,
        "customer_email": "developers@flutterwavego.com"
      },
      "plan": 3657,
      "status": "cancelled",
      "created_at": "2019-12-31T17:00:55.000Z"
    },
    {
      "id": 4146,
      "amount": 2000,
      "customer": {
        "id": 247490,
        "customer_email": "developers@flutterwavego.com"
      },
      "plan": 3657,
      "status": "cancelled",
      "created_at": "2019-12-31T14:44:20.000Z"
    }
  ]
}
Fetch subscriptions with customer's email
This describes how to fetch subscriptions made by a single user.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY  );
const getSubscription = async () => {

    try {
        const data = {
            "email": "cornelius@flutterwavego.com"
        }
        const response = await flw.Subscription.get(data)
        console.log(response);
    } catch (error) {
        console.log(error)
    }
}
getSubscription();
Sample Response

{
    "status": "success",
    "message": "Plan subscriptions fetched",
    "meta": {
        "page_info": {
            "total": 1,
            "current_page": 1,
            "total_pages": 1
        }
    },
    "data": [
        {
            "id": 15376,
            "amount": 2000,
            "customer": {
                "id": 1500129,
                "customer_email": "cornelius@flutterwavego.com"
            },
            "plan": 17490,
            "status": "cancelled",
            "created_at": "2022-01-24T15:05:45.000Z"
        }
    ]
}
Cancel a subscription
This describes how to cancel a subscription

const Flutterwave = require('flutterwave-node-v3');

const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY  );

const cancelSubscription = async () => {

    try {
        const payload={
            "id":"4147" //This is the unique id of the subscription you want to cancel. It is returned in the Get a subscription call as data.id
        }
        
        const response = await flw.Subscription.cancel(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

cancelSubscription();
Sample Response

{
  "status": "success",
  "message": "Subscription cancelled",
  "data": {
    "id": 4147,
    "amount": 2000,
    "customer": {
      "id": 247546,
      "customer_email": "developers@flutterwavego.com"
    },
    "plan": 3657,
    "status": "cancelled",
    "created_at": "2019-12-31T17:00:55.000Z"
  }
}
Activate a subscription
This describes how to activate a subscription

const Flutterwave = require('flutterwave-node-v3');

const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY  );

const activateSubscription = async () => {

    try {
        const payload={
            "id":"4147" //This is the unique id of the subscription you want to activate. It is returned in the Get a subscription call as data.id
        }
        
        const response = await flw.Subscription.activate(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

activateSubscription();
Sample Response

{
  "status": "success",
  "message": "Subscription activated",
  "data": {
    "id": 4147,
    "amount": 2000,
    "customer": {
      "id": 247546,
      "customer_email": "developers@flutterwavego.com"
    },
    "plan": 3657,
    "status": "active",
    "created_at": "2019-12-31T17:00:55.000Z"
  }
}


Tokenization
We recommend reading the main readme first, to understand the requirements for using the library and how to initiate this in your apps. This guide assumes you've read that.

Manage Tokenized charges via any of these methods:

Create a tokenized charge
Create bulk tokenized charge
Fetch a bulk tokenized charge status
Fetch a bulk tokenized charge transactions
Update token details
Charge with token
This describes how to create a tokenized charge

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const charge_with_token =  async()=>{
 
    try {

        const payload = {
            "token": "flw-t1nf-f9b3bf384cd30d6fca42b6df9d27bd2f-m03k",
            "currency": "NGN",
            "country": "NG",
            "amount": 2000,
            "email": "user@example.com",
            "first_name": "Flutterwave",
            "last_name": "Developers",
            "ip": "123.876.0997.9",
            "narration": "Sample tokenized charge",
            "tx_ref": "tokenized-c-001"
        }
       const response =  await flw.Tokenized.charge(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                            
   
}

charge_with_token();
Sample Response

{
   "status":"success",
   "message":"Charge successful",
   "data":{
      "id":277036749,
      "tx_ref":"new-live-test",
      "flw_ref":"FLW253481676",
      "redirect_url":"http://127.0.0",
      "device_fingerprint":"N/A",
      "amount":300,
      "charged_amount":300,
      "app_fee":4.2,
      "merchant_fee":0,
      "processor_response":"APPROVED",
      "auth_model":"noauth",
      "currency":"NGN",
      "ip":"123.456.543",
      "narration":"pstmn charge",
      "status":"successful",
      "payment_type":"card",
      "created_at":"2020-06-01T01:31:59.000Z",
      "account_id":17321,
      "customer":{
         "id":210745229,
         "phone_number":null,
         "name":"Flutterwave Developers",
         "email":"user@example.com",
         "created_at":"2020-06-01T01:27:24.000Z"
      },
      "card":{
         "first_6digits":"123456",
         "last_4digits":"7890",
         "issuer":"MASTERCARD GUARANTY TRUST BANK Mastercard Naira Debit Card",
         "country":"NG",
         "type":"MASTERCARD",
         "expiry":"08/22",
         "token":"flw-t1nf-f9b3bf384cd30d6fca42b6df9d27bd2f-m03k"
      }
   }
}
Update token details
This describes how to update details tied to a card token

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const update_token = async () => {

    try {

        const payload = {
            "token": "flw-t1nf-cff007a7699efee339c9271b9be4f3d7-m03k",
            "email": "user@example.com",
            "first_name": "Kendrick",
            "last_name": "Graham",
            "phone_number": "09090909990"
        }
        const response = await flw.Tokenized.update_token(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

update_token();
Sample Response

{
    "status": "success",
    "message": "Token details updated",
    "data": {
        "customer_email": "user@example.com",
        "customer_full_name": "Kendrick Graham",
        "customer_phone_number": "09090909990",
        "created_at": "2020-01-15T13:26:24.000Z"
    }
}
Create bulk tokenized charge
This describes how to charge multiple payment tokens at once

const charge_bulk = async () => {

    try {

        const payload = {
            "title": "Staff salary for June",
            "retry_strategy": {
                "retry_interval": 120,
                "retry_amount_variable": 60,
                "retry_attempt_variable": 2
            },
            "bulk_data": [
                {
                    "currency": "NGN",
                    "token": "flw-t1nf-6de8b97a7e1abb221decad7887afa45a-m03k",
                    "country": "NG",
                    "amount": 3500,
                    "email": "user@example.com",
                    "first_name": "Olufemi",
                    "last_name": "Obafunmiso",
                    "ip": "pstmn",
                    "tx_ref": "akhlm-pstmn-blkchrg-xx6"
                },
                {
                    "currency": "NGN",
                    "token": "flw-t1nf-f9b3bf384cd30d6fca42b6df9d27bd2f-m03k",
                    "country": "NG",
                    "amount": 3000,
                    "email": "user@example.com",
                    "first_name": "Temi",
                    "last_name": "Adesina",
                    "ip": "pstmn",
                    "tx_ref": "akhlm-pstmn-blkchrge-xx7"
                }
            ]
        }
        const response = await flw.Tokenized.bulk(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

charge_bulk();
Sample Response

{
  "status": "success",
  "message": "Bulk charge successful",
  "data": {
    "id": 130,
    "created_at": "2020-01-19T21:43:39.000Z",
    "approver": "N/A"
  }
}
Get a bulk tokenized charge status
This describes how to get the status of a bulk tokenized charge

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const fetchBulk = async () => {

    try {

        const payload = {
            "bulk_id":"156"
            }
        const response = await flw.Tokenized.fetch_bulk(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

fetchBulk();
Sample Response

{
    "status": "success",
    "message": "Bulk charge fetched",
    "data": {
        "id": 156,
        "title": "akhlm blk tknzd chrg pstmn tst 1",
        "approver": "N/A",
        "processed_charges": 2,
        "pending_charges": 0,
        "total_charges": 2
    }
}
Get bulk tokenized charge transactions
This describes how to get specific bulk tokenized charge transactions

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const fetch_charge_transactions = async () => {

    try {

        const payload = {
            "bulk_id":"156"
            }
        const response = await flw.Tokenized.fetch_charge_transactions(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

fetch_charge_transactions();
Sample Response

{
  "status": "success",
  "message": "Bulk charge transactions fetched",
  "data": [
    {
      "tx_ref": "akhlm-pstmn-blkchrg-xx6",
      "id": "1017000",
      "flw_ref": "FLW-M03K-7544dc8d157ca763bbcf864a24906f93",
      "device_fingerprint": "N/A",
      "amount": 3500,
      "currency": "NGN",
      "charged_amount": 3549,
      "app_fee": 49,
      "merchant_fee": 0,
      "processor_response": "Approved",
      "auth_model": "noauth",
      "ip": "pstmn",
      "narration": "Kizito Akhilome",
      "status": "successful",
      "payment_type": "card",
      "created_at": "2020-01-19T21:46:29.000Z",
      "account_id": "73362",
      "amount_settled": 3450,
      "card": {
        "expiry": "09/22",
        "type": "MASTERCARD",
        "country": "NIGERIA NG",
        "issuer": "MASTERCARD  CREDIT",
        "first_6digits": "553188",
        "last_4digits": "2950"
      },
      "customer": {
        "id": "252759",
        "email": "user@example.com",
        "phone_number": "0813XXXXXXX",
        "name": "Kizito Akhilome",
        "created_at": "2020-01-15T13:26:24.000Z"
      }
    },
    {
      "tx_ref": "akhlm-pstmn-blkchrg-xx6",
      "id": "1017004",
      "flw_ref": "FLW-M03K-4aa1f32bbc80a7cf9e42426e9b2d73eb",
      "device_fingerprint": "N/A",
      "amount": 3500,
      "currency": "NGN",
      "charged_amount": 3549,
      "app_fee": 49,
      "merchant_fee": 0,
      "processor_response": "Approved",
      "auth_model": "noauth",
      "ip": "pstmn",
      "narration": "Kizito Akhilome",
      "status": "successful",
      "payment_type": "card",
      "created_at": "2020-01-19T21:49:29.000Z",
      "account_id": "73362",
      "amount_settled": 3450,
      "card": {
        "expiry": "09/22",
        "type": "MASTERCARD",
        "country": "NIGERIA NG",
        "issuer": "MASTERCARD  CREDIT",
        "first_6digits": "553188",
        "last_4digits": "2950"
      },
      "customer": {
        "id": "252759",
        "email": "user@example.com",
        "phone_number": "0813XXXXXXX",
        "name": "Kizito Akhilome",
        "created_at": "2020-01-15T13:26:24.000Z"
      }
    },
    {
      "tx_ref": "akhlm-pstmn-blkchrg-xx6",
      "id": "1163067",
      "flw_ref": "FLW-M03K-9d02da3020c67ac05ade7b596881d59f",
      "device_fingerprint": "N/A",
      "amount": 3500,
      "currency": "NGN",
      "charged_amount": 3500,
      "app_fee": 1050,
      "merchant_fee": 0,
      "processor_response": "Approved",
      "auth_model": "noauth",
      "ip": "pstmn",
      "narration": "Kizito Akhilome",
      "status": "successful",
      "payment_type": "card",
      "created_at": "2020-03-11T19:22:06.000Z",
      "account_id": "73362",
      "amount_settled": 2450,
      "card": {
        "expiry": "09/22",
        "type": "MASTERCARD",
        "country": "NIGERIA NG",
        "issuer": "MASTERCARD  CREDIT",
        "first_6digits": "553188",
        "last_4digits": "2950"
      },
      "customer": {
        "id": "252759",
        "email": "user@example.com",
        "phone_number": "0813XXXXXXX",
        "name": "Kendrick Graham",
        "created_at": "2020-01-15T13:26:24.000Z"
      }
    },
    {
      "tx_ref": "akhlm-pstmn-blkchrge-xx6",
      "id": "1017001",
      "flw_ref": "FLW-M03K-bbd148a9569b709882da8437e123ba61",
      "device_fingerprint": "N/A",
      "amount": 3000,
      "currency": "NGN",
      "charged_amount": 3042,
      "app_fee": 42,
      "merchant_fee": 0,
      "processor_response": "Approved",
      "auth_model": "noauth",
      "ip": "pstmn",
      "narration": "Kizito Akhilome",
      "status": "successful",
      "payment_type": "card",
      "created_at": "2020-01-19T21:46:30.000Z",
      "account_id": "73362",
      "amount_settled": 2950,
      "card": {
        "expiry": "09/22",
        "type": "MASTERCARD",
        "country": "NIGERIA NG",
        "issuer": "MASTERCARD  CREDIT",
        "first_6digits": "553188",
        "last_4digits": "2950"
      },
      "customer": {
        "id": "252759",
        "email": "user@example.com",
        "phone_number": "0813XXXXXXX",
        "name": "Kizito Akhilome",
        "created_at": "2020-01-15T13:26:24.000Z"
      }
    },
    {
      "tx_ref": "akhlm-pstmn-blkchrge-xx6",
      "id": "1017005",
      "flw_ref": "FLW-M03K-3a046716482046ea974c73d73eaa4463",
      "device_fingerprint": "N/A",
      "amount": 3000,
      "currency": "NGN",
      "charged_amount": 3042,
      "app_fee": 42,
      "merchant_fee": 0,
      "processor_response": "Approved",
      "auth_model": "noauth",
      "ip": "pstmn",
      "narration": "Kizito Akhilome",
      "status": "successful",
      "payment_type": "card",
      "created_at": "2020-01-19T21:49:30.000Z",
      "account_id": "73362",
      "amount_settled": 2950,
      "card": {
        "expiry": "09/22",
        "type": "MASTERCARD",
        "country": "NIGERIA NG",
        "issuer": "MASTERCARD  CREDIT",
        "first_6digits": "553188",
        "last_4digits": "2950"
      },
      "customer": {
        "id": "252759",
        "email": "user@example.com",
        "phone_number": "0813XXXXXXX",
        "name": "Kizito Akhilome",
        "created_at": "2020-01-15T13:26:24.000Z"
      }
    },
    {
      "tx_ref": "akhlm-pstmn-blkchrge-xx6",
      "id": "1163068",
      "flw_ref": "FLW-M03K-02c21a8095c7e064b8b9714db834080b",
      "device_fingerprint": "N/A",
      "amount": 3000,
      "currency": "NGN",
      "charged_amount": 3000,
      "app_fee": 1000,
      "merchant_fee": 0,
      "processor_response": "Approved",
      "auth_model": "noauth",
      "ip": "pstmn",
      "narration": "Kizito Akhilome",
      "status": "successful",
      "payment_type": "card",
      "created_at": "2020-03-11T19:22:07.000Z",
      "account_id": "73362",
      "amount_settled": 2000,
      "card": {
        "expiry": "09/22",
        "type": "MASTERCARD",
        "country": "NIGERIA NG",
        "issuer": "MASTERCARD  CREDIT",
        "first_6digits": "553188",
        "last_4digits": "2950"
      },
      "customer": {
        "id": "252759",
        "email": "user@example.com",
        "phone_number": "0813XXXXXXX",
        "name": "Kendrick Graham",
        "created_at": "2020-01-15T13:26:24.000Z"
      }
    }
  ]
}

COLLECTIONS
We recommend reading the main readme first, to understand the requirements for using the library and how to initiate this in your apps. This guide assumes you've read that.

Collect payments from your users via any of these methods:

Cards
Bank transfers
Direct debit (Nigerian bank accounts)
Direct debit (UK bank accounts)
ACH payments
Mpesa
Ghana Mobile Money
Uganda Mobile Money
Rwanda Mobile Money
Zambia Mobile Money
Francophone Mobile Money (for Senegal, Cote D'Ivoire, Mali and Cameroon)
Tanzania Mobile Money
USSD
Enaira
ApplePay
GooglePay
There are three steps involved in collecting payments from your users:

Initating the transaction.
Authorizing the transaction.
Verifying the transaction.
Read more about the steps here

Card Collections
This section describes how you can collect card payments in the SDK. You can learn more about the payment method here.

Kindly note that enckey is your encryption key. You can get this from your API setting in the dashboard. You can check here to get more information on how to get your encryption key.

const Flutterwave = require('flutterwave-node-v3');
const open = require('open');

const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// Initiating the transaction
const payload = {
    "card_number": "5531886652142950",
    "cvv": "564",
    "expiry_month": "09",
    "expiry_year": "21",
    "currency": "NGN",
    "amount": "100",
    "redirect_url": "https://www.google.com",
    "fullname": "Flutterwave Developers",
    "email": "developers@flutterwavego.com",
    "phone_number": "09000000000",
    "enckey": process.env.FLW_ENCRYPTION_KEY,
    "tx_ref": "example01",
}

const chargeCard = async () => {
    try {
        const response = await flw.Charge.card(payload)
        console.log(response)

        // Authorizing transactions

        // For PIN transactions
        if (response.meta.authorization.mode === 'pin') {
            let payload2 = payload
            payload2.authorization = {
                "mode": "pin",
                "fields": [
                    "pin"
                ],
                "pin": 3310
            }
            const reCallCharge = await flw.Charge.card(payload2)

            // Add the OTP to authorize the transaction
            const callValidate = await flw.Charge.validate({
                "otp": "12345",
                "flw_ref": reCallCharge.data.flw_ref
            })
            console.log(callValidate)

        }
        // For 3DS or VBV transactions, redirect users to their issue to authorize the transaction
        if (response.meta.authorization.mode === 'redirect') {

            var url = response.meta.authorization.redirect
            open(url)
        }

        console.log(response)


    } catch (error) {
        console.log(error)
    }
}

chargeCard();
Bank Transfers
This section covers how you can collect payments made via bank transfers. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const  bank_trf = async () => {

    try {

        const payload = {
            "tx_ref": "MC-1585230950508",
            "amount": "1500",
            "email": "johnmadakin@gmail.com",
            "phone_number": "054709929220",
            "currency": "NGN",
            "client_ip": "154.123.220.1",
            "device_fingerprint": "62wd23423rq324323qew1",
            "narration": "All star college salary for May",
            "is_permanent": false,
            "expires": 3600
        }

        const response = await flw.Charge.bank_transfer(payload)
        console.log(response);

    } catch (error) {
        console.log(error)
    }

}

bank_trf();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "meta": {
        "authorization": {
            "transfer_reference": "MockFLWRef-1689847855598",
            "transfer_account": "0067100155",
            "transfer_bank": "Mock Bank",
            "account_expiration": 1689847855598,
            "transfer_note": "Mock note",
            "transfer_amount": "1500.00",
            "mode": "banktransfer"
        }
    }
}
Direct debit (Nigerian bank account)
This section covers how you can collect payments made via your customers' bank accounts. The customer authorizes the payment with their bank, and the money is debited from their account. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const charge_ng_acct = async () => {
    
    try {

        const payload = {
            "tx_ref":"MC-1585230ew9v5050e0",
            "amount":"300",
            "currency":"NGN",
            "email":"johndoe@gmail.com",
            "phone_number":"08074568890",
            "fullname":"john doe"
        }

        const response = await flw.Charge.ng(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

charge_ng_acct();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "data": {
        "id": 4475057,
        "tx_ref": "MC-1585230ew9v5050e0",
        "flw_ref": "1689845911540-FLW-MOCK-REF",
        "device_fingerprint": "N/A",
        "amount": 300,
        "charged_amount": 300,
        "app_fee": 4.2,
        "merchant_fee": 0,
        "processor_response": "Pending validation",
        "auth_model": "INTERNET_BANKING",
        "currency": "NGN",
        "ip": "54.75.161.64",
        "narration": "Flutterwave Developers",
        "status": "pending",
        "auth_url": "https://ravesandboxapi.flutterwave.com/flwv3-pug/getpaid/api/short-url/aqp45TtNl",
        "payment_type": "account",
        "fraud_status": "ok",
        "created_at": "2023-07-20T09:38:31.000Z",
        "account_id": 20937,
        "customer": {
            "id": 2151369,
            "phone_number": "08074568890",
            "name": "john doe",
            "email": "johndoe@gmail.com",
            "created_at": "2023-07-20T09:37:34.000Z"
        },
        "meta": {
            "authorization": {
                "mode": "redirect",
                "redirect": "https://ravesandboxapi.flutterwave.com/flwv3-pug/getpaid/api/short-url/aqp45TtNl",
                "validate_instructions": ""
            }
        }
    }
}
Direct debit (UK & EU bank account)
This section covers how you make EUR and GBP collections via your customers' bank accounts. The customer is redirected to an interface where they select their bank and authorize the payment via their bank apps. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const charge_uk_acct = async () => {

    try {

        const payload = {
            "tx_ref": "MC-1585230ew9v5050e8",
            "amount": "10",
            "currency": "GBP",
            "email": "olufemi@flw.com",
            "phone_number": "0902620185",
            "fullname": "Olufemi Obafunmiso",
            "redirect_url": "https://flutterwave.ng",
            "is_token_io": 1
        }

        const response = await flw.Charge.uk(payload)
        console.log(response);

    } catch (error) {
        console.log(error)
    }

}

charge_uk_acct();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "data": {
        "id": 4474995,
        "tx_ref": "MC-1585230ew9v5050e8",
        "flw_ref": "LFTT5300124270590",
        "device_fingerprint": "N/A",
        "amount": 10,
        "charged_amount": 10,
        "app_fee": 0.14,
        "merchant_fee": 0,
        "processor_response": "Transaction is pending authentication",
        "auth_model": "TOKEN",
        "currency": "GBP",
        "ip": "52.209.154.143",
        "narration": "Flutterwave Developers",
        "status": "pending",
        "payment_type": "account-ach-uk",
        "fraud_status": "ok",
        "charge_type": "normal",
        "created_at": "2023-07-20T09:22:11.000Z",
        "account_id": 20937,
        "customer": {
            "id": 2151343,
            "phone_number": "07086234518",
            "name": "Olufemi Obafunmiso",
            "email": "olufemi@flw.com",
            "created_at": "2023-07-20T09:22:11.000Z"
        }
    },
    "meta": {
        "authorization": {
            "mode": "redirect",
            "redirect": "https://token-io-fe.dev-flutterwave.com/transactions?reference=LFTT5300124270590"
        }
    }
}
ACH Payement
This shows you how to accept ZAR and USD ACH charges from your customers. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const ach_payment = async () => {

    try {

        const payload = {
            "tx_ref": "MC-1585230ew9v5050e8",
            "amount": "100",
            "type": "ach_payment",
            "currency": "ZAR",
            "country": "SA",
            "email": "olufemi@flw.com",
            "phone_number": "0902620185",
            "fullname": "Olufemi Obafunmiso",
            "client_ip": "154.123.220.1",
            "redirect_url": "http://olufemiobafunmiso.com/u/payment-completed",
            "device_fingerprint": "62wd23423rq324323qew1",
            "meta": {
                "flightID": "123949494DC"
            }
        }

        const response = await flw.Charge.ach(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

ach_payment();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "data": {
        "id": 1190657,
        "tx_ref": "MC-15852309v5050e8",
        "flw_ref": "FLW751551585302175553",
        "device_fingerprint": "62wd23423rq324323qew1",
        "amount": 100,
        "charged_amount": 100,
        "app_fee": 1.4,
        "merchant_fee": 0,
        "processor_response": "Pending Validation",
        "auth_model": "AUTH",
        "auth_url": "https://flutterwavestaging.com:9443/flwusprocessor/redirect?hid=FLW3f9f99f0e5534d438c15297bc608f21d",
        "currency": "USD",
        "ip": "154.123.220.1",
        "narration": "Yolande Aglaé Colbert",
        "status": "success-pending-validation",
        "payment_type": "account-ach-us",
        "fraud_status": "ok",
        "charge_type": "normal",
        "created_at": "2020-03-27T09:42:54.000Z",
        "account_id": 73362,
        "redirect_url": "https://www.flutterwave.com/us/",
        "customer": {
            "id": 349079,
            "phone_number": "0902620185",
            "name": "Yolande Aglaé Colbert",
            "email": "user@example.com",
            "created_at": "2020-03-27T09:42:54.000Z"
        }
    }
}
USSD
This shows you how to accept payments via Direct USSD charge. You call our API to create a charge, then your customer completes the payment by dialling their bank's USSD code on their mobile phone. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const ussd = async () => {

    try {

        const payload = {
            "tx_ref": "MC-15852309v5050e8",
            "account_bank": "058"
            "amount": "1500",
            "currency": "NGN",
            "email": "user@flw.com",
            "phone_number": "07033923458",
            "fullname": "Yemi Desola"
        }

        const response = await flw.Charge.ussd(payload)
        console.log(response);
    } catch (error) {
        console.log(error)
    }

}

ussd();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "data": {
        "id": 4517159,
        "tx_ref": "MC-15852309v5050e8",
        "flw_ref": "flwm3s4m0c1691591875526",
        "device_fingerprint": "N/A",
        "amount": 1500,
        "charged_amount": 1500,
        "app_fee": 21,
        "merchant_fee": 0,
        "processor_response": "Transaction in progress",
        "auth_model": "USSD",
        "currency": "NGN",
        "ip": "52.209.154.143",
        "narration": "Flutterwave Developers",
        "status": "pending",
        "payment_type": "ussd",
        "fraud_status": "ok",
        "charge_type": "normal",
        "created_at": "2023-08-09T14:37:55.000Z",
        "account_id": 20937,
        "customer": {
            "id": 2172937,
            "phone_number": "07033923458",
            "name": "Yemi Desola",
            "email": "user@flw.com",
            "created_at": "2023-08-09T14:37:55.000Z"
        },
        "payment_code": "4517159"
    },
    "meta": {
        "authorization": {
            "mode": "ussd",
            "note": "*566*002*4517159#"
        }
    }
}
Mpesa
This describes how to collect payments via Mpesa. Read more about Mpesa payments here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const mpesa =  async () =>{

    try {

        const payload = {
            "tx_ref": "test987",
            "amount": "10",
            "currency": "KES",
            "email": "stefan.wexler@hotmail.eu",
            "phone_number": "25454709929220",
            "fullname": "Yolande Aglaé Colbert"
        }

       const response =  await flw.MobileMoney.mpesa(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                            
   
}
 
 
mpesa();
Sample Response

{
   "status": "success",
   "message": "Charge initiated",
   "data": {
      "id": 4193428,
      "tx_ref": "test987",
      "flw_ref": "2993238342",
      "device_fingerprint": "N/A",
      "amount": 10,
      "charged_amount": 10,
      "app_fee": 0.29,
      "merchant_fee": 0,
      "processor_response": "Successful",
      "auth_model": "LIPA_MPESA",
      "currency": "KES",
      "ip": "::127.0.0.1",
      "narration": "FLW-PBF MPESA Transaction ",
      "status": "pending",
      "auth_url": "N/A",
      "payment_type": "mpesa",
      "fraud_status": "ok",
      "charge_type": "normal",
      "created_at": "2023-03-10T02:25:16.000Z",
      "account_id": 20937,
      "customer": {
         "id": 1998111,
         "phone_number": "25454709929220",
         "name": "Yolande Aglaé",
         "email": "stefan.wexler@hotmail.eu",
         "created_at": "2023-03-10T02:25:16.000Z"
      }
   }
}
Ghana mobile money
This describes how to collect payments via Ghana mobile money. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const Gh_mobilemoney =  async () =>{
 
    try {

        const payload = {
            "tx_ref": "test789",
            "amount": "150",
            "currency": "GHS",
            "network": "VODAFONE",
            "email": "stefan.wexler@hotmail.eu",
            "phone_number": "054709929220",
            "fullname": "Yolande Aglaé Colbert",
            "device_fingerprint": "62wd23423rq324323qew1",
        }

       const response =  await flw.MobileMoney.ghana(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                            
  
}

Gh_mobilemoney();
Sample Response

{
   "body": {
      "status": "success",
      "message": "Charge initiated",
      "meta": {
         "authorization": {
            "redirect": "https://ravemodal-dev.herokuapp.com/captcha/verify/83940:dede0352930befaac522ca71e969f0e2",
            "mode": "redirect"
         }
      }
   }
}
Redirect customer to the redirect link returned in the charge initiation response. NB: OTP on staging (TEST MODE) is 123456

Rwanda mobile money
This describes how to collect payments via Rwanda mobile money. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const rw_mobile_money =  async ()=>{
 
    try {

        const payload = {
            "tx_ref": "MC-158523s09v5050e8", 
            "order_id": "USS_URG_893982923s2323",
            "amount": "1500",
            "currency": "RWF",
            "email": "olufemi@flw.com",
            "phone_number": "054709929220",
            "fullname": "John Madakin"
        }

       const response =  await flw.MobileMoney.rwanda(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                            
   
}

rw_mobile_money();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "meta": {
        "authorization": {
            "redirect": "https://ravemodal-dev.herokuapp.com/captcha/verify/lang-en/97635:6450140e7b1d0108b402bd3c326f2d15",
            "mode": "redirect"
        }
    }
}
Redirect customer to the redirect link returned in the charge initiation response. NB: OTP on staging (TEST MODE) is 123456

Uganda mobile money
This describes how to collect payments via Uganda mobile money. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const ug_mobile_money =  async () =>{

    try {

        const payload = {
            "tx_ref": "MC-1585230950508",
            "amount": "1500",
            "email": "olufemi@flw.com",
            "phone_number": "054709929220",
            "currency": "UGX",
            "fullname": "Olufemi Obafunmiso",
            "redirect_url": "https://rave-webhook.herokuapp.com/receivepayment",
            "voucher": "128373",
            "network": "MTN"
        }

       const response =  await flw.MobileMoney.uganda(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                            
   
}

ug_mobile_money();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "meta": {
        "authorization": {
            "redirect": "https://ravemodal-dev.herokuapp.com/captcha/verify/lang-en/97639:6bd0e317a5d95ccc7ea163482b33bdd2",
            "mode": "redirect"
        }
    }
}
Redirect customer to the redirect link returned in the charge initiation response. NB: OTP on staging (TEST MODE) is 123456

Francophone mobile money
This describes how to collect payments via mobile money for Franc (XAF or XOF). We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const franc_mobile_money =  async () =>{
 
    try {

        const payload = {
            "tx_ref": 'test321',
            "amount": '10',
            "currency": 'XAF',
            "country": 'CM',
            "email": 'stefan.wexler@hotmail.eu',
            "phone_number": '23700000020',
            "fullname": 'Yolande Aglaé Colbert',
        }
       const response =  await flw.MobileMoney.franco_phone(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                            
   
}

franc_mobile_money();
Sample Response

{
   "body": {
      "status": "success",
      "message": "Charge initiated",
      "data": {
         "id": 4193429,
         "tx_ref": "test321",
         "flw_ref": "JFIX8206716784151202",
         "device_fingerprint": "N/A",
         "amount": 10,
         "charged_amount": 10,
         "app_fee": 0.25,
         "merchant_fee": 0,
         "processor_response": "Transaction in progress",
         "auth_model": "AUTH",
         "currency": "XAF",
         "ip": "::127.0.0.1",
         "narration": "Flutterwave Developers",
         "status": "pending",
         "payment_type": "mobilemoneysn",
         "fraud_status": "ok",
         "charge_type": "normal",
         "created_at": "2023-03-10T02:25:18.000Z",
         "account_id": 20937,
         "customer": {
            "id": 1998112,
            "phone_number": "23700000020",
            "name": "Yolande Aglaé",
            "email": "stefan.wexler@hotmail.eu",
            "created_at": "2023-03-10T02:25:18.000Z"
         }
      },
      "meta": {
         "authorization": {
            "mode": "callback",
            "redirect_url": null
         }
      }
   }
}
Zambia mobile money
This describes how to collect payments via Zambia mobile money. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const zambia_mobile_money =  async () =>{
 
    try {

        const payload = {
            "tx_ref": "MC-15852113s09v5050e8",
            "amount": "1500",
            "currency": "ZMW",
            "email": "olufemi@flw.com",
            "phone_number": "054709929220",
            "fullname": "Olufemi Obafunmiso",
            "order_id": "URF_MMGH_1585323540079_5981535" //Unique identifier for the mobilemoney transaction to be provided by the merchant
        }
       const response =  await flw.MobileMoney.zambia(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                               
}

zambia_mobile_money();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "meta": {
        "authorization": {
            "redirect": "https://ravemodal-dev.herokuapp.com/captcha/verify/lang-en/97640:5dd11685fe49474090416b67eff38dc7",
            "mode": "redirect"
        }
    }
}
Tanzania mobile money
This describes how to collect payments via Tanzania mobile money. You can get more information on Tanzania mobile money here

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const tanzania_mobile_money =  async () =>{
 
    try {

        const payload = {
            "tx_ref":"MC-158523s09v5050e8",
            "amount":"150",
            "currency":"TZS",
            "network":"Halopesa",
            "email":"user@example.com",
            "phone_number":"0782835136",
            "fullname":"Yolande Aglaé Colbert",
            "client_ip":"154.123.220.1",
            "device_fingerprint":"62wd23423rq324323qew1",
            "meta":{
               "flightID":"213213AS"
                  }
        }
       const response =  await flw.MobileMoney.tanzania(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                               
}

tanzania_mobile_money();
Sample Response

{
    "status": "success",
    "message": "Charge initiated",
    "data": {
        "id": 976392302,
        "tx_ref": "MC-158523s09v5050e8",
        "flw_ref": "SWWD88181689192176819143",
        "device_fingerprint": "62wd23423rq324323qew1",
        "amount": 150,
        "charged_amount": 150,
        "app_fee": 1000,
        "merchant_fee": 0,
        "processor_response": "request successful 20230712200256022250 Payment Request has been Accepted Successfully Waiting for Confirmation",
        "auth_model": "MOBILEMONEY",
        "currency": "TZS",
        "ip": "154.123.220.1",
        "narration": "Adekunle Odujoko",
        "status": "pending",
        "payment_type": "mobilemoneytz",
        "fraud_status": "ok",
        "charge_type": "normal",
        "created_at": "2023-07-12T20:02:56.000Z",
        "account_id": 1834035,
        "customer": {
            "id": 617886609,
            "phone_number": "0782835136",
            "name": "Yolande Aglaé",
            "email": "user@example.com",
            "created_at": "2023-07-12T20:02:56.000Z"
        }
    }
}
Enaira
This describes how to collect payments via enaira. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const eNaira =  async () =>{
 
    try {

        const payload = {
            "tx_ref":"MC-TEST-123456",
            "amount":"100",
            "currency":"NGN",
            "email":"user@example.com",
            "fullname":"Yemi Desola",
            "phone_number":"09000000000",
            "redirect_url":"https://flutterwave.ng"
        }
       const response =  await flw.Charge.enaira(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                               
}

eNaira();
Sample Response

{
   "status": "success",
   "message": "Charge initiated",
   "data": {
      "id": 4197118,
      "tx_ref": "12345test_05",
      "flw_ref": "ZZYO0021678723801871881",
      "device_fingerprint": "N/A",
      "amount": 200,
      "charged_amount": 200,
      "app_fee": 2.8,
      "merchant_fee": 0,
      "processor_response": "pending",
      "auth_model": "ENAIRA",
      "currency": "NGN",
      "ip": "54.75.161.64",
      "narration": "Flutterwave Developers",
      "status": "pending",
      "payment_type": "enaira",
      "fraud_status": "ok",
      "charge_type": "normal",
      "created_at": "2023-03-13T16:10:00.000Z",
      "account_id": 20937,
      "customer": {
         "id": 1953337,
         "phone_number": "08092269174",
         "name": "Wisdom Joshua",
         "email": "wsdmjsh@gmail.com",
         "created_at": "2023-01-18T13:22:14.000Z"
      },
      "meta": {
         "authorization": {
            "mode": "redirect",
            "redirect": "https://camltest.azurewebsites.net/enairapay/?invoiceId=01GVDVRTG80MVSRJJQQYRFTZK3&amount=200&token=438890"
         }
      }
   }
}
Apple Pay
This describes how to collect payments via Apple Pay. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const applePay =  async () =>{
 
    try {

        const payload = {
            "tx_ref":"MC-TEST-123456",
            "amount":"10",
            "currency":"USD",
            "email": "user@example.com",
            "fullname": "Yolande Aglaé Colbert",
            "redirect_url":"https://flutterwave.ng",
            "client_ip":"192.168.0.1",
            "device_fingerprint":"gdgdhdh738bhshsjs",
            "billing_zip":"15101",
            "billing_city":"allison park",
            "billing_address":"3563 Huntertown Rd",
            "billing_state":"Pennsylvania",
            "billing_country":"US",
            "phone_number":"09012345678",
            "meta":{
                "metaname":"testmeta",
                "metavalue":"testvalue"
            }
        }
       const response =  await flw.Charge.applepay(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                               
}

applePay();
Sample Response

{
   "status": "success",
   "message": "Charge initiated",
   "data": {
      "id": 645498756,
      "tx_ref": "MC-TEST-1234523",
      "flw_ref": "TKVH48681032738026",
      "device_fingerprint": "gdgdhdh738bhshsjs",
      "amount": 1,
      "charged_amount": 1.04,
      "app_fee": 0.04,
      "merchant_fee": 0,
      "processor_response": "Pending validation",
      "auth_model": "APPLEPAY",
      "currency": "GBP",
      "ip": "192.168.0.1",
      "narration": "Test payment",
      "status": "pending",
      "auth_url": "https://applepay.aq2-flutterwave.com?reference=TKVH48681032738026",
      "payment_type": "applepay",
      "fraud_status": "ok",
      "charge_type": "normal",
      "created_at": "2022-06-11T12:18:11.000Z",
      "account_id": 3442,
      "customer": {
         "id": 379560157,
         "phone_number": "09012345678",
         "name": "Flutterwave Developers",
         "email": "developers@flutterwavego.com",
         "created_at": "2022-06-11T12:18:11.000Z"
      },
      "meta": {
         "authorization": {
            "mode": "redirect",
            "redirect": "https://applepay.aq2-flutterwave.com?reference=TKVH48681032738026"
         }
      }
   }
}
Google Pay
This describes how to collect payments via Google Pay. We go into more details on the payment flow itself here.

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const googlePay =  async () =>{
 
    try {

        const payload = {
            "tx_ref": "MC-TEST-1234568_success_mock",
            "amount": "10",
            "currency": "USD",
            "email": "user@example.com",
            "fullname": "Yolande Aglaé Colbert",
            "redirect_url": "https://flutterwave.ng",
            "client_ip": "192.168.0.1",
            "device_fingerprint": "gdgdhdh738bhshsjs",
            "billing_zip": "15101",
            "billing_city": "allison park",
            "billing_address": "3563 Huntertown Rd",
            "billing_state": "Pennsylvania",
            "billing_country": "US",
            "meta": {
                "metaname": "testmeta",
                "metavalue": "testvalue"
            }
        }
       const response =  await flw.Charge.googlepay(payload)
       console.log(response);
    } catch (error) {
        console.log(error)
    }                               
}

googlePay();
Sample Response

{
   "status": "success",
   "message": "Charge initiated",
   "data": {
      "id": 2615403,
      "tx_ref": "MC-TEST-1234568_success_mock",
      "flw_ref": "RQFA6549001367743",
      "device_fingerprint": "gdgdhdh738bhshsjs",
      "amount": 10,
      "charged_amount": 10,
      "app_fee": 0.38,
      "merchant_fee": 0,
      "processor_response": "Payment token retrieval has been initiated",
      "auth_model": "GOOGLEPAY_NOAUTH",
      "currency": "USD",
      "ip": "54.75.56.55",
      "narration": "Test Google Pay charge",
      "status": "pending",
      "auth_url": "https://rave-api-v2.herokuapp.com/flwv3-pug/getpaid/api/short-url/XPtNw-WkQ",
      "payment_type": "googlepay",
      "fraud_status": "ok",
      "charge_type": "normal",
      "created_at": "2022-05-11T20:36:15.000Z",
      "account_id": 20937,
      "customer": {
         "id": 955307,
         "phone_number": null,
         "name": "Yolande Aglaé Colbert",
         "email": "user@example.com",
         "created_at": "2022-05-11T20:36:14.000Z"
      },
      "meta": {
         "authorization": {
            "mode": "redirect",
            "redirect": "https://rave-api-v2.herokuapp.com/flwv3-pug/getpaid/api/short-url/XPtNw-WkQ"
         }
      }
   }
}


---
title: Provisioning API Keys
subtitle: Manage API keys programmatically
headline: Provisioning API Keys | Programmatic Control of OpenRouter API Keys
canonical-url: 'https://openrouter.ai/docs/features/provisioning-api-keys'
'og:site_name': OpenRouter Documentation
'og:title': Provisioning API Keys - Programmatic Control of OpenRouter API Keys
'og:description': >-
  Manage OpenRouter API keys programmatically through dedicated management
  endpoints. Create, read, update, and delete API keys for automated key
  distribution and control.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=features/provisioning-api-keys&title=Provisioning%20API%20Keys&description=Programmatically%20manage%20OpenRouter%20API%20keys
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

OpenRouter provides endpoints to programmatically manage your API keys, enabling key creation and management for applications that need to distribute or rotate keys automatically.

## Creating a Provisioning API Key

To use the key management API, you first need to create a Provisioning API key:

1. Go to the [Provisioning API Keys page](https://openrouter.ai/settings/provisioning-keys)
2. Click "Create New Key"
3. Complete the key creation process

Provisioning keys cannot be used to make API calls to OpenRouter's completion endpoints - they are exclusively for key management operations.

## Use Cases

Common scenarios for programmatic key management include:

- **SaaS Applications**: Automatically create unique API keys for each customer instance
- **Key Rotation**: Regularly rotate API keys for security compliance
- **Usage Monitoring**: Track key usage and automatically disable keys that exceed limits

## Example Usage

All key management endpoints are under `/api/v1/keys` and require a Provisioning API key in the Authorization header.

<CodeGroup>

```python title="Python"
import requests

PROVISIONING_API_KEY = "your-provisioning-key"
BASE_URL = "https://openrouter.ai/api/v1/keys"

# List the most recent 100 API keys
response = requests.get(
    BASE_URL,
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)

# You can paginate using the offset parameter
response = requests.get(
    f"{BASE_URL}?offset=100",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)

# Create a new API key
response = requests.post(
    f"{BASE_URL}/",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "name": "Customer Instance Key",
        "label": "customer-123",
        "limit": 1000  # Optional credit limit
    }
)

# Get a specific key
key_hash = "<YOUR_KEY_HASH>"
response = requests.get(
    f"{BASE_URL}/{key_hash}",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)

# Update a key
response = requests.patch(
    f"{BASE_URL}/{key_hash}",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "name": "Updated Key Name",
        "disabled": True  # Disable the key
    }
)

# Delete a key
response = requests.delete(
    f"{BASE_URL}/{key_hash}",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)
```

```typescript title="TypeScript"
const PROVISIONING_API_KEY = 'your-provisioning-key';
const BASE_URL = 'https://openrouter.ai/api/v1/keys';

// List the most recent 100 API keys
const listKeys = await fetch(BASE_URL, {
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// You can paginate using the `offset` query parameter
const listKeys = await fetch(`${BASE_URL}?offset=100`, {
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Create a new API key
const createKey = await fetch(`${BASE_URL}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Customer Instance Key',
    label: 'customer-123',
    limit: 1000, // Optional credit limit
  }),
});

// Get a specific key
const keyHash = '<YOUR_KEY_HASH>';
const getKey = await fetch(`${BASE_URL}/${keyHash}`, {
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Update a key
const updateKey = await fetch(`${BASE_URL}/${keyHash}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Updated Key Name',
    disabled: true, // Disable the key
  }),
});

// Delete a key
const deleteKey = await fetch(`${BASE_URL}/${keyHash}`, {
  method: 'DELETE',
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});
```

</CodeGroup>

## Response Format

API responses return JSON objects containing key information:

```json
{
  "data": [
    {
      "created_at": "2025-02-19T20:52:27.363244+00:00",
      "updated_at": "2025-02-19T21:24:11.708154+00:00",
      "hash": "<YOUR_KEY_HASH>",
      "label": "sk-or-v1-customkey",
      "name": "Customer Key",
      "disabled": false,
      "limit": 10,
      "usage": 0
    }
  ]
}
```

When creating a new key, the response will include the key string itself.

