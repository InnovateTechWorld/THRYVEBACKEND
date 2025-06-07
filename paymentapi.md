Flutterwave Standard
Learn how to use Flutterwave’s Standard flow to make payments.

Flutterwave's payment flow works as follows:

Make a server-side request to our create payment endpoint.
We’ll return a link to a payment page. Simply redirect your customer to this link to complete their payment.
Once the transaction is completed, we’ll redirect the customer back to your site.

Step 1: Create Payment Details
First, you need to create the payment details for the transaction. Here is a list of the parameters you'll need:

Parameters	Definition
tx_ref	A reference code you'll generate to identify this transaction. This must be unique for every transaction.
amount	The amount to charge the customer.
currency	The currency to charge in. If you don't specify a value, we'll assume "NGN".
redirect_url	The URL to redirect the customer to after payment is done.
customer	An object containing the customer details. An email is required, and you can also pass a name and phonenumber.
session_duration (optional)	The duration (minutes) that the session should remain valid for. The maximum possible value is 1440 minutes (24 hours).
max_retry_attempt (optional)	This allows you to set the maximum number of times that a customer can retry after a failed transaction before the checkout is closed.
customizations (optional)	An object containing options to customize the look of the payment modal. You can set a title, logo, and description.
meta (optional)	An object containing any extra information you'd like to store alongside the transaction e.g {consumer_id: 23, consumer_mac: '92a3-912ba-1192a'}.
payment_plan (optional)	The payment plan ID (for when you're collecting a recurring payment).
subaccounts (optional)	An array of objects containing the subaccount IDs to split the payment into. See split payments for more on this.
payment_options (optional)	The payment options to be displayed. See payment methods.
🚧
Payment Options

The payment_options field only works if you've toggled Enable preferred payment methods in the Business preference settings on your Dashboard.



Transaction Integrity
To ensure the security of payments on the client side, you can optionally use the checksum feature.

To utilize it when initiating the charge, you need to include a field called payload_hash in the request payload. This is a hashed value created by encrypting some immutable values in your request.

The hash is computed at runtime, and compared to the value that has been passed in your request to ensure that the payment is secure.


Step 2: Get a Payment Link
Next, you'll initiate the payment by calling our API with the collected payment details (remember to authorize with your secret key). Here's an example in Node.js

Node.js

const axios = require('axios');

try {
	const response = await axios.post(
		'https://api.flutterwave.com/v3/payments',
		{
			tx_ref: 'UNIQUE_TRANSACTION_REFERENCE',
			amount: '7500',
			currency: 'NGN',
			redirect_url: 'https://example_company.com/success',
			customer: {
				email: 'developers@flutterwavego.com',
				name: 'Flutterwave Developers',
				phonenumber: '09012345678',
			},
			customizations: {
				title: 'Flutterwave Standard Payment',
			},
		},
		{
			headers: {
				Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
				'Content-Type': 'application/json',
			},
		}
	);
} catch (err) {
	console.error(err.code);
	console.error(err.response.data);
}
And you'll get a response like this:

Success

{
	"status": "success",
	"message": "Hosted Link",
	"data": {
		"link": "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-01hynrt7cd1fpm6gtef6khn93g"
	}
}

Step 3: Redirect the User to the Payment Link
Now, all you need to do is redirect your customer to the link returned in data.link, and we'll display our checkout modal for them to complete the payment.



Step 4: After the Payment
Four things will happen when payment is done (successful):

We'll redirect to your redirect_url with status, tx_ref, and transaction_id query parameters after payment is complete.
We'll send you a webhook if you have that enabled. Learn more about webhooks.
We'll send an email receipt to your customer if the payment was successful (unless you've disabled that).
We'll send you an email notification (unless you've disabled that).
On your server, you should handle the redirect and always verify the final state of the transaction.

Here's what transaction verification could look like in a Node.js app with our backend SDK:

Node.js

app.get('/payment-callback', async (req, res) => {
    if (req.query.status === 'successful') {
        const transactionDetails = await Transaction.find({ref: req.query.tx_ref});
        const response = await flw.Transaction.verify({id: req.query.transaction_id});
        if (
            response.data.status === "successful"
            && response.data.amount === transactionDetails.amount
            && response.data.currency === "NGN") {
            // Success! Confirm the customer's payment
        } else {
            // Inform the customer their payment was unsuccessful
        }
    }
);

What if the Payment Fails
If the payment attempt fails (for instance, due to insufficient funds), you don't need to do anything. We'll keep the payment page open, so the customer can try again until the payment succeeds or they choose to cancel, after which we'll redirect to the redirect_url with the query parameters tx_ref and a status of failed.

If you have webhooks enabled, we'll send you a notification for each failed payment attempt. This is useful in case you want to later reach out to customers who had issues paying. See our webhooks guide for an example.


Disabling Payment Links
🚧
Supported Method

Only payment links generated via Flutterwave standard can be disabled. A 400 Error response is returned from the endpoint anytime an invalid link is passed to the endpoint.

Flutterwave enables merchants to disable payment links generated through the Flutterwave standard feature. This is useful when a merchant delists unavailable products or services, preventing customers from making payments for those items.


How to Disable a Payment Link via API
To disable a payment link through the API, you need to send the link as a body parameter to the Disable payment link endpoint.

cURL
200 OK
400 Bad Request

curl --request POST \
--url 'https://api.flutterwave.com/v3/payments/link/disable' \
--header 'Authorization: Bearer {{YOUR_SECRET_KEY}}' \
--header 'Content-Type: application/json' \
--data '{
     "link": "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk-01j8hkejppgm821xv8mfxfpgrb"
}'
Once a payment link has been successfully disabled, users attempting to access the link in a browser will be unable to proceed and will be presented with the error screen below.


If you try to disable a link that is already disabled, we'll return an error informing you about the link status.

400 Bad request

{
    "status": "error",
    "message": "This payment link is currently inactive",
    "data": null
}

Handling Payment Retries and Timeout on Checkout
Flutterwave allows you to configure retries and timeout on checkout to further improve your customers' experience. By setting session_duration, you limit the completion time for each payment. Once the duration has elapsed, the payment window is closed, and the user is redirected to the specified URL (redirect_url). Uncompleted transactions are immediately cancelled and marked as failed.

Timeout can be set to a max value of 1440 minutes.

Additionally, you can limit the number of attempts that a user can make for failed transactions on checkout. By setting max_retry_attempt, the user is prevented from attempting transactions unnecessarily on checkout. When making a payment, the transaction would be cancelled and marked as failed once a user's attempts go beyond the maximum retries.

Using these configurations can help you improve security on checkout by limiting payment attempts of malicious users. For example, if timeout and retry for a transaction are set to 10 minutes and five (5) attempts, respectively. The transaction fails automatically if the user makes more than five attempts or spends more than 10 minutes completing the transaction.

Node.js

const axios = require('axios');

try {
	const response = await axios.post(
		'https://api.flutterwave.com/v3/payments',
		{
			tx_ref: 'UNIQUE_TRANSACTION_REFERENCE',
			amount: '7500',
			currency: 'NGN',
			redirect_url: 'https://example_company.com/success',
			customer: {
				email: 'developers@flutterwavego.com',
				name: 'Flutterwave Developers',
				phonenumber: '09012345678',
			},
			customizations: {
				title: 'Flutterwave Standard Payment',
			},
			configurations: {
				session_duration: 10, // Session timeout in minutes (maxValue: 1440)
				max_retry_attempt: 5, // Max retry (int)
			},
		},
		{
			headers: {
				Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
				'Content-Type': 'application/json',



Payment Methods
Find a payment method that supports your use case.

Flutterwave supports a variety of payment methods for customers across many countries. When accepting payments, you can specify which methods you are willing to accept from your customers.

There are two ways to specify your accepted payment method.

1. Account Settings
Enable or disable payment methods globally in your account settings. This will set what payment methods are available to your customers across Flutterwave Inline, Standard, and HTML checkout.

🚧
Payment Options

For payment_options to work, you need to uncheck the Enable Dashboard Payment Options on your Account Settings. You can find a guide here.



2. Per Payment
For more control, you can also set payment methods on a per-transaction basis using the payment_options parameter. This field accepts a comma + space separated list of allowed payment methods.

Here's how it would look with Flutterwave Inline, Standard, and HTML checkout:


Inline
Standard
HTML Checkout

const response = await got.post('https://api.flutterwave.com/v3/payments', {
	headers: {
		Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
	},
	json: {
		// other fields...
		payment_options: 'card, ussd, mobilemoneyghana',
	},
});
Some payment methods are tied to specific currencies. When displaying the payment options to the customer, we’ll automatically exclude any that are not applicable to the current currency.

For instance, mpesa is only available for KES, so if you specify payment_options as "card, account, mpesa" when collecting an NGN payment, we'll only show card and account payment options on the modal.

Supported Payment Methods
Here is a list of currently supported payment methods and the value to use when specifying them in payment_options:

Payment option	Value
Card payment	card
Bank account (direct debit)	account
Bank transfer	banktransfer
M-Pesa	mpesa
Mobile mobile Ghana	mobilemoneyghana
Mobile money Francophone Africa	mobilemoneyfranco
Mobile money Uganda	mobilemoneyuganda
Mobile money Rwanda	mobilemoneyrwanda
Mobile money Zambia	mobilemoneyzambia
Barter payment	barter
QR payment	nqr
USSD	ussd
Credit payment	credit
Opay	opay
Please note that not all methods are supported across all countries. Countries/currencies are mapped to different payment methods in that region. You can see the full list of supported methods by region below:

Country	Currency code	Payment Options
Nigeria	NGN	card ussd banktransfer account internetbanking nqr applepay googlepay enaira opay
United States	US	card account googlepay applepay
Europe	EUR	card account googlepay applepay
United Kingdom	GBP	card account googlepay applepay
Ghana	GHS	card ghanamobilemoney
Francophone Africa (Cetral Africa)	XAF	card mobilemoneyfranco
Francophone Africa (West Africa)	XOF	card mobilemoneyfranco
South Africa	ZAR	card account 1voucher googlepay applepay
Malawi	MWK	card mobilemoneymalawi
Kenya	KES	card mpesa
Uganda	UGX	card mobilemoneyuganda
Rwanda	RWF	card mobilemoneyrwanda
Tanzania	TZS	card mobilemoneytanzania
Expiring Payments
For banktransfer payments (also called pay with Bank Transfer); you can specify an expiry period for transactions.

Inline
JavaScript

const response = await got.post('https://api.flutterwave.com/v3/payments', {
	headers: {
		Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
	},
	json: {
		// other fields...
		bank_transfer_options: {
			expires: 3600,
		},
	},
});
Payment Plans
Payment plans let you set up subscriptions for your customers on Flutterwave.

You can customize the billing interval, amount, and duration when creating a payment plan. When you first charge a customer, they are automatically subscribed to the plan.
Flutterwave will then manage future billing cycles and offer options to cancel or reactivate the subscription.

How Subscription Works
To use our subscription features, you will need to create a payment plan via our API or from your dashboard. Then, subscribe a customer to the plan by specifying the plan ID the first time you charge the customer. We'll handle subsequent charges when the billing is due.

📘
How Subscription Works

Subscriptions are tied to a customer's email address and cannot be changed afterwards. This means that if a customer changes their email address on your app, you'll need to cancel any existing subscription and create a new one with the new email.

On subsequent billing cycles, we'll send the customer an email reminder before automatically charging them. If the charge fails, we'll try 3 more times at 30-minute intervals.

🚧
Cancelling Charge

If we attempt to charge a customer and it fails three consecutive times, we'll cancel the user's subscription.

We'll send you a webhook notification whenever a charge succeeds or fails or when a subscription is cancelled.

To learn more about payment plans, check out our Help Center.

Creating a Payment Plan
To create a payment plan, you'll need to specify these details:


Parameter	Meaning
name	The name of the plan. This will be used on the email reminders we send customers.
interval	This is the billing interval. Here are the supported values: hourly daily weekly monthly yearly quarterly bi-annually every x y (where x is a number and y is a period, e.g. "every five months", "every 90 days", "every one year")
amount (optional)	The amount to charge the customer each time. You can set the amount when creating the plan or collecting the first payment or both (see Dynamic amounts).
currency (optional)	The currency to charge in. The default is "NGN".
duration (optional)	How long the subscription should last (in terms of the interval). For example, if the interval is monthly, a duration of 5 will charge the customer once a month for 5 months and then stop. If you don't specify a duration, we'll charge the customer indefinitely until they (or you) cancel.
Once you've got these details, call our create payment plans endpoint to create a new payment plan. Here's an example using our backend SDKs:

Node.js
PHP
Ruby
Python
cURL

// Install with: npm i flutterwave-node-v3

const Flutterwave = require('flutterwave-node-v3');
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
const details = {
    amount: 5000,
    name: "Church collections plan",
    interval: "monthly",
};
flw.PaymentPlan.create(details)
    .then(console.log)
    .catch(console.log);
And you'll get a response like this:

JSON

{
  "status": "success",
  "message": "Payment plan created",
  "data": {
    "id": 3807,
    "name": "Church collections plan",
    "amount": 5000,
    "interval": "monthly",
    "duration": 48,
    "status": "active",
    "currency": "NGN",
    "plan_token": "rpp_12d2ef3d5ac1c13b9d30",
    "created_at": "2020-01-16T18:08:19.000Z"
  }
}
Adding a Customer to a Subscription
To add a customer to a subscription, specify the payment plan ID when charging the customer for the first time. This works regardless of how you're charging your customers—Inline, Standard, HTML checkout, or direct card charge.

📘
Integration Tip

The currency you specify when charging the customer must be the same as the currency you specified when creating the payment plan.

🚧
Card Payments Only

If you include a payment plan when initiating a payment, the payment method will automatically be fixed to card.

Inline
Standard (Node.js)
HTML
Direct Charge (Node.js)

const response = await got.post("https://api.flutterwave.com/v3/payments", {
    headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
    },
    json: {
        // other fields...
        payment_plan: 3807,
    }
});
After the first successful payment, Flutterwave will charge the card subsequently based on the interval set for the payment plan.

Dynamic Amounts
When you want to charge customers different amounts on the same plan, or charge a different amount for the first month (for example, as a launch promo), you can do this by setting the amount when charging the customer. Here are your options:

To charge a different amount per customer: Don't set amount when creating the payment plan. The amount you set when charging the customer will be used for that customer's subscription.
To charge the customer a different amount the first time, and a standard amount for subsequent payments: Specify the standard amount when creating the payment plan, and specify the custom amount when charging the customer. We'll charge the customer the custom amount for the first payment, and the standard amount on the plan for subsequent payments.
Cancelling and Activating
Cancelling a subscription can happen in one of three ways:

A customer can cancel their subscription using the cancellation link in our email reminders. You can disable this in the Account Settings page of your dashboard.
You can cancel an individual customer's subscription, either from the Payment Plans page on your dashboard or via the cancel subscription endpoint.
You can cancel an entire payment plan, which will cancel all associated subscriptions. You can also do this from the Payment Plans page on your dashboard or via the cancel payment plan endpoint.
Cancelling a subscription will tigger a webhook event.

Cancelled subscriptions and payment plans can be activated later using the activate subscription and update payment plan endpoints respectively.

Webhooks
Each time we try to charge the customer's card, we'll send a notification to your webhook URL containing the details and result of the charge. We'll also send a webhook when the subscription is cancelled.

Here are some sample webhooks:

Successful Charge
Cancelled Subscription

{
  "event": "charge.completed",
  "data": {
    "id": 285959875,
    "tx_ref": "Links-616626414629",
    "flw_ref": "PeterEkene/FLW270177170",
    "device_fingerprint": "a42937f4a73ce8bb8b8df14e63a2df31",
    "amount": 100,
    "currency": "NGN",
    "charged_amount": 100,
    "app_fee": 1.4,
    "merchant_fee": 0,
    "processor_response": "Approved by Financial Institution",
    "auth_model": "PIN",
    "ip": "197.210.64.96",
    "narration": "CARD Transaction ",
    "status": "successful",
    "payment_type": "card",
    "created_at": "2020-07-06T19:17:04.000Z",
    "account_id": 17321,
    "customer": {
      "id": 215604089,
      "name": "Yemi Desola",
      "phone_number": null,
      "email": "user@gmail.com",
      "created_at": "2020-07-06T19:17:04.000Z"
    },
    "card": {
      "first_6digits": "123456",
      "last_4digits": "7889",
      "issuer": "VERVE FIRST CITY MONUMENT BANK PLC",
      "country": "NG",
      "type": "VERVE",
      "expiry": "02/23"
    }
  }
}
Learn More
To learn more about what you can do with payment plans on Flutterwave, check out our reference docs. If you have any questions, reach out to us.


Create payment plan
post
https://api.flutterwave.com/v3/payment-plans
Create a payment plan for your customers.

Log in to see full request history
time	status	user agent	
Make a request to see history.

Body Params
amount
int32
required
Defaults to 5000
This is the amount to charge all customers subscribed to this plan.

5000
name
string
required
Defaults to Monthly Nepa Bill Collection
This is the name of the payment plan, it will appear on the subscription reminder emails

Monthly Nepa Bill Collection
interval
string
required
Defaults to Monthly
This will determine the frequency of the charges for this plan. Could be yearly, quarterly, monthly, weekly, daily, etc.

Monthly
duration
int32
Defaults to 24
This is the frequency, it is numeric, e.g. if set to 5 and intervals is set to monthly you would be charged 5 months, and then the subscription stops

24
Metadata
Authorization
string
required
Defaults to Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Pass your secret key as a bearer token in the request header to authorize this call

Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Responses

200
200


400
400

Response body
object

import flutterwavedoc from '@api/flutterwavedoc';

flutterwavedoc.createPaymentPlan1({
  amount: 5000,
  name: 'Monthly Nepa Bill Collection',
  interval: 'Monthly',
  duration: 24
}, {
  Authorization: 'Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X'
})
  .then(({ data }) => console.log(data))
  .catch(err => console.error(err));


  Get payment plans
get
https://api.flutterwave.com/v3/payment-plans
This section describes how to fetch all payment plans on your account.

Log in to see full request history
time	status	user agent	
Make a request to see history.

Metadata
from
string
Defaults to 2020-01-01
This is the specified date to start the list from. YYYY-MM-DD

2020-01-01
to
string
Defaults to 2020-05-05
The is the specified end period for the search. YYYY-MM-DD

2020-05-05
page
int32
Defaults to 1
This is the page number to retrieve e.g. setting 1 retrieves the first page

1
amount
int32
Defaults to 5000
This is the exact amount set when creating the payment plan

5000
currency
string
Defaults to NGN
This is the currency the payment plan amount is charged in

NGN
interval
string
Defaults to weekly
This is how often the payment plan is set to execute

weekly
status
string
Defaults to active
This is the status of the payment plan

active
Authorization
string
required
Defaults to Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Pass your secret key as a bearer token in the request header to authorize this call

Response body
object
status
string
message
string
meta
object
page_info
object

page_info object
data
array of objects
object
id
integer
Defaults to 0
name
string
amount
integer
Defaults to 0
interval
string
duration
integer
Defaults to 0
status
string
currency
string
plan_token
string
created_at
string


import flutterwavedoc from '@api/flutterwavedoc';

flutterwavedoc.getPaymentPlans({
  from: '2020-01-01',
  to: '2020-05-05',
  page: '1',
  amount: '5000',
  currency: 'NGN',
  interval: 'weekly',
  status: 'active',
  Authorization: 'Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X'
})
  .then(({ data }) => console.log(data))
  .catch(err => console.error(err));


  Get a payment plan
get
https://api.flutterwave.com/v3/payment-plans/{id}
This section describes how to get a single payment plan

Log in to see full request history
time	status	user agent	
Make a request to see history.

Metadata
id
int32
required
Defaults to 3807
This is the unique id of the payment plan you want to fetch. It is returned in the call to create a payment plan as data.id

3807
Authorization
string
required
Defaults to Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Pass your secret key as a bearer token in the request header to authorize this call

Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Responses

200
200

Response body
object
status
string
message
string
data
object
id
integer
Defaults to 0
name
string
amount
integer
Defaults to 0
interval
string
duration
integer
Defaults to 0
status
string
currency
string
plan_token
string
created_at
string

import flutterwavedoc from '@api/flutterwavedoc';

flutterwavedoc.getAPaymentPlan({id: '3807', Authorization: 'Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X'})
  .then(({ data }) => console.log(data))
  .catch(err => console.error(err));


  Update a payment plan
put
https://api.flutterwave.com/v3/payment-plans/{id}
This endpoint help the merchant/developer update an existing payment plan.

Log in to see full request history
time	status	user agent	
Make a request to see history.

Body Params
name
string
required
Defaults to January neighbourhood contribution
The new name of the payment plan

January neighbourhood contribution
status
string
required
Defaults to active
The new status of the payment plan

active
Metadata
id
int32
required
Defaults to 3807
This is the unique id of the payment plan you want to fetch. It is returned in the call to create a payment plan as data.id

3807
Authorization
string
required
Defaults to Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Pass your secret key as a bearer token in the request header to authorize this call

Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X

import flutterwavedoc from '@api/flutterwavedoc';

flutterwavedoc.updateAPaymentPlan({
  name: 'January neighbourhood contribution',
  status: 'active'
}, {
  id: '3807',
  Authorization: 'Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X'
})
  .then(({ data }) => console.log(data))
  .catch(err => console.error(err));

  Cancel a payment plan
put
https://api.flutterwave.com/v3/payment-plans/{id}/cancel
This endpoint help the merchant/developer cancel an existing payment plan.

Log in to see full request history
time	status	user agent	
Make a request to see history.

Metadata
id
int32
required
Defaults to 3807
This is the unique ìd` of the payment plan you want to cancel

3807
Authorization
string
required
Defaults to Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Pass your secret key as a bearer token in the request header to authorize this call

Bearer FLWSECK_TEST-SANDBOXDEMOKEY-X
Responses

Webhooks
Learn how to handle Flutterwave events on your webhook endpoint.

🚧
Prerequisites for Webhook Implementation

Before implementing a webhook, make sure you've read the following sections: Structure of a Webhook Payload, Implementing a Webhook, and Best Practices.

Webhooks are an important part of your payment integration. They allow Flutterwave to notify you about events that happen on your account, such as successful payment or a failed transaction. When your system receives a webhook notification, it's your responsibility to verify the information before taking any action. This helps your application process only legitimate and valid transactions.

A webhook URL is an endpoint on your server where these notifications are sent. When an event occurs, Flutterwave sends a POST request to that endpoint. The request contains a JSON body with details about the event, including the event type and associated data.

📘
Flutterwave's IP Addresses are Dynamic and May Change Over Time.

To ensure seamless webhook integration, we recommend avoiding strict IP whitelisting. Instead, consider implementing signature verification for security.


When to Use Webhooks
Webhooks are supported for all kinds of payment methods, but they're especially useful for methods and events that happen outside your application's control, such as:

Getting paid via mobile money or USSD
A customer is being charged for their subscription (recurring payments).
A pending payment transitioning to successful.
These are all asynchronous actions, as your application does not control them, so you won't know when they are completed unless we notify you or you check later.

Setting up a webhook allows us to notify you when these payments are completed. Within your webhook endpoint, you can then:

Update a customer's membership records in your database when a subscription payment succeeds.

Email a customer when a subscription payment fails.

Update your order records when the status of a pending payment is updated to successful.


Enabling Webhooks
Here is how to set up a webhook on your Flutterwave account:

Log in to your dashboard and click on Settings.
Navigate to Webhooks to add your webhook URL.
Check all the boxes and save your Settings.


ℹ️
Tip

When testing, you can get an instant webhook URL by visiting webhook.site. This will allow you to inspect the received payload without having to write any code or set up a server.


Structure of a Webhook Payload
All webhook payloads (except virtual card debit) follow the same basic structure:

An event field describing the type of event.
A data object. The content of this object will vary depending on the event, but typically, it will contain details of the event, including:
an id containing the ID of the transaction.
a status describing the status of the transaction.
payment or customer details, if applicable.
Here are some sample webhook payloads for transfers and payments:

Successful Payment
Failed Payment
Successful Transfer
Failed Transfer
Virtual Card Debit
Virtual Card OTP
Cancelled Subscription
PSA Inflow
BVN Verification
Successful Bill Payment

{
  "event": "charge.completed",
  "data": {
    "id": 285959875,
    "tx_ref": "Links-616626414629",
    "flw_ref": "PeterEkene/FLW270177170",
    "device_fingerprint": "a42937f4a73ce8bb8b8df14e63a2df31",
    "amount": 100,
    "currency": "NGN",
    "charged_amount": 100,
    "app_fee": 1.4,
    "merchant_fee": 0,
    "processor_response": "Approved by Financial Institution",
    "auth_model": "PIN",
    "ip": "197.210.64.96",
    "narration": "CARD Transaction ",
    "status": "successful",
    "payment_type": "card",
    "created_at": "2020-07-06T19:17:04.000Z",
    "account_id": 17321,
    "customer": {
      "id": 215604089,
      "name": "Yemi Desola",
      "phone_number": null,
      "email": "user@gmail.com",
      "created_at": "2020-07-06T19:17:04.000Z"
    },
    "card": {
      "first_6digits": "123456",
      "last_4digits": "7889",
      "issuer": "VERVE FIRST CITY MONUMENT BANK PLC",
      "country": "NG",
      "type": "VERVE",
      "expiry": "02/23"
    }
  }
}

Implementing a Webhook
Creating a webhook endpoint on your server is the same as writing any other API endpoint, but there are a few important details to note:


Verifying Webhook Signatures
When enabling webhooks, you have the option to set a secret hash. Since webhook endpoints are publicly accessible, the secret hash allows you to verify that incoming requests are from Flutterwave. You can specify any value as your secret hash, but we recommend something random. You should also store it as an environment variable on your server.

If you specify a secret hash, we'll include it in our request to your webhook endpoint, in a header called verif-hash. In the webhook endpoint, check if the verif-hash header is present and that it matches the secret hash you set. If the header is missing, or the value doesn't match, you can discard the request, as it isn't from Flutterwave.


Responding to Webhook Requests
To acknowledge receipt of a webhook, your endpoint must return a 200 HTTP status code. Any other response codes, including 3xx codes, will be treated as a failure. We don't care about the response body or headers.


Webhook Timeout
Webhook requests time out after 60 seconds. Your webhook endpoint must respond within this window. If it doesn't, the request will be marked as failed. If webhook retries are enabled, we’ll attempt to resend the request.

ℹ️
Handling Webhook Retries

Be sure to enable webhook retries on your dashboard. If we don't get a 200 status code (for example, if your server is unreachable), we'll retry the webhook call 3 times, with a 30-minute interval between each attempt.


Examples
Here are a few examples of implementing a webhook endpoint in some web frameworks:

🚧
Rails and Django

Web frameworks like Rails or Django check POST requests for CSRF tokens, a security measure against cross-site request forgery. Exclude webhook endpoints from CSRF protection.

Node.js
PHP
Python
Ruby

// In an Express-like app:

app.post("/flw-webhook", (req, res) => {
    // If you specified a secret hash, check for the signature
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers["verif-hash"];
    if (!signature || (signature !== secretHash)) {
        // This request isn't from Flutterwave; discard
        res.status(401).end();
    }
    const payload = req.body;
    // It's a good idea to log all received events.
    log(payload);
    // Do something (that doesn't take too long) with the payload
    res.status(200).end()
});


Best Practices

Always Verify Critical Transaction Data
Before giving value to a customer based on a webhook notification, always re-query our API to verify the transaction details. This helps confirm that the data returned is consistent with what you’re expecting and has not been compromised.

For example, when you receive a successful payment notification, call the transaction verification endpoint to confirm that the status, amount, currency, and tx_ref match the expected value in your system before confirming the customer's order.

JavaScript

const payload = req.body;
const response = await flw.Transaction.verify({id: payload.id});
if (
    response.data.status === "successful"
    && response.data.amount === expectedAmount
    && response.data.currency === expectedCurrency
    && response.data.tx_ref === expectedReference ) {
    // Success! Confirm the customer's payment
} else {
    // Inform the customer their payment was unsuccessful
}

Don't Rely Solely on Webhooks
Have a backup strategy in place in case your webhook endpoint fails. For instance, if your webhook endpoint throws server errors, you won't know about any new customer payments because webhook requests will fail.

To get around this, we recommend setting up a background job that polls for the status of any pending transactions at regular intervals (for instance, every hour) using the transaction verification endpoint till a successful or failed response is returned.


Use a Secret Hash
Remember, your webhook endpoint is public; anyone can send a fake payload. We recommend using a secret hash so you can be sure the requests you get are from Flutterwave.


Respond Quickly
Your webhook endpoint needs to respond within a certain time limit, or we'll consider it a failure and try again. Avoid doing long-running tasks or network calls in your webhook endpoint so you don't hit the timeout.

If your framework supports it, you can have your webhook endpoint immediately return a 200 status code, and then perform the rest of its duties; otherwise, you should dispatch any long-running tasks to a job queue and then respond.


Be Idempotent
Occasionally, we might send the same webhook event more than once. You should make your event processing idempotent (calling the webhook multiple times will have the same effect), so you don't end up giving a customer value multiple times.

One way of doing this is recording the events you've processed and then checking if the status has changed before processing the duplicate event:

JavaScript

const payload = req.body;
const existingEvent = await PaymentEvent.where({id: payload.id}).find();
if (existingEvent.status === payload.status) {
    // The status hasn't changed,
    // so it's probably just a duplicate event
    // and we can discard it
    res.status(200).end();
}

// Record this event
await PaymentEvent.save(payload);
// Process event...


Testing
Learn how to test your integration.

When integrating a payment gateway, you will need to test your implementation before going live. We've got test credentials for you to test a variety of use cases and allow you to simulate both successful and failed scenarios.

🚧
Using Test Credentials and Mock Data

These credentials and data work exclusively in Test Mode. If you require mock data to test a specific flow or feature, please contact our support team.


Cards
Below are card details to use to make a mock payment. To ensure accurate testing, please select the appropriate test card based on the authorization model (PIN, 3DS, AVS, and NoAuth) required for your card transaction.

Each card triggers a specific authorization flow, essential for replicating the different direct card charge scenarios.

📘
Test Mode Transaction Receipt Email Delivery

In test mode, transaction receipt emails are sent to your business email, not your customers'. To send test receipts to customers, please contact support.


Successful Payments
Here is a list of cards to simulate a successful payment.

Type	Network	Card Number	Expiry	CVV	OTP	PIN
PIN authentication	Mastercard	5531886652142950	09/32	564	12345	3310
3DS authentication	Mastercard	5438898014560229	10/31	564	12345	3310
3DS authentication	Visa	4187427415564246	09/32	828	12345	3310
3DS authentication	Afrigo	5640003941605320	05/26	044	-	-
PIN authentication	Verve	5061460410120223210	10/31	780	12345	3310
NoAuth	Verve	5061460166976054667	10/29	564	-	3310
Address Verification (AVS)	Visa	4556052704172643	09/32	899	12345	3310
Pre-authentication Test Card	Mastercard	5377283645077450	09/31	789	-	3310
Failed Payments
Here is a list of cards to simulate a failed payment.

Type	Network	Card Number	Expiry	CVV	OTP	PIN
Card Declined (Address Verification)	Mastercard	5143010522339965	08/32	276	12345	3310
Card Fraudulent	Mastercard	5590131743294314	11/32	887	12345	3310
Card Insufficient Funds	Mastercard	5258585922666506	09/31	883	12345	3310
Do Not Honour	Mastercard	5143010522339965	08/31	276	-	3310
Insufficient Funds	Mastercard	5258585922666506	09/31	883	12345	-
Insufficient Funds	Afrigo	5640007065275380	05/26	044	-	-
Restricted Card, Retain Card	Mastercard	5551651630381384	08/31	276	-	-
Invalid Transaction	Mastercard	5551658157653822	08/31	276	-	-
Function Not Permitted to Cardholder	Mastercard	5258582054729020	11/30	887	-	-
Function Not Permitted to Terminal	Mastercard	5258588264565682	11/30	887	-	-
Transaction Error	Mastercard	5258589130149016	11/30	887	-	-
Incorrect PIN	Mastercard	5399834697894723	09/31	883	12345	3310

Testing Payment on Checkout
To properly render checkout on your local environment, you'd need to route your app to localhost:<preferred-port> e.g. localhost:3000. Pointing your app to an IP address e.g. 127.0.0.1:3000 would result in errors.

Credentials are listed in the card, and mobile money sections to help you test your checkout integration.

OTPs
Any OTP passed in test transactions will pass validation. However, you can use these special OTPs to mock specific error scenarios:

WRONG OTP: 5548
INSUFFICIENT FUNDS: 6648
ℹ️
Testing Tip

These special OTPs will only work (simulate failed payments) when the OTP validation happens directly in our payment modal. If you are redirected to our OTP validation page, you'll need to use one of the test cards designated for failed payments.


Bank Accounts
Successful Payments
Bank account details to use to mock a successful payment.

Bank	Account number	OTP
Access Bank (044)	0690000031	12345
Access Bank (044)	0690000032	12345
Access Bank (044)	0690000033	12345
Access Bank (044)	0690000034	12345

ℹ️
Testing Tip

If you need more Access Bank test account numbers, you can keep incrementing the last digit of the test account numbers above to get new test account numbers, right up to 0690000041.


Blacklisted Accounts
A blacklisted account indicates that the account has been flagged due to suspicious activity or non-compliance with regulations. When an account is blacklisted, transfers to that account are blocked to safeguard users from potential risks.

Common Reasons for Blacklisting:

Fraudulent activity (e.g., money laundering or unauthorized transactions).
Violation of terms (e.g., using the service for prohibited activities).
Security concerns (e.g., account compromise).
Regulatory compliance issues (e.g., sanctions or anti-money laundering regulations).
Blocking transfers to blacklisted accounts helps ensure compliance and protect users from fraud.

Testing Blacklisted Accounts in Your Application
To simulate a blacklisted account and handle the expected 400 error response, you can use the following test credentials in test mode:

Bank	Account Number	Account Name
Access Bank (044)	0690000036	Bode George
You’ll get a response similar to this:

JSON

{
   "status": "error",
   "message": "Payout was made to a blacklisted account number",
   "data": null
}
Mobile Money
Successful Payments
To mock a successful mobile money payment, you can use any mobile number and the OTP 123456.

Failed Payments
You can make mocked failed transactions for your integration tests using any of the following numbers below. Update the country code of each number to match the code of your customer's number.

S/N	Mobile number	Error message
1.	233121212121	Mocked a Failed Transaction
2.	233010101011	Mocked a Failed Transaction
Testing Apple Pay or Google Pay
When testing Apple Pay and Google Pay transactions, You can mock successful and failed transactions by appending the appropriate suffix to your transaction reference.

To mock a successful transaction: Make sure your reference ends with _success_mock (for example, "dfs23fhr7ntg0293039_success_mock").

To mock a failed transaction: Make sure your reference ends with _failed_mock (for example, "dfs23fhr7ntg0293039_failed_mock").

Testing Transfers
🚧
IP Whitelisting

In order to conduct a successful integration test, it's important to ensure that you whitelist the IP addresses of the servers making the transfer API calls.

When testing a transfer, you can use any of our provided test accounts. By default, such transfers will always remain in a PENDING state. You can force transfers to behave differently by using a special kind of transaction reference when creating the transfer.

To mock a successful transfer: Make sure your reference ends with _PMCK (for example, "dfs23fhr7ntg0293039_PMCK").
To mock a failed transfer: Make sure your reference ends with _PMCK_ST_F (for example, "dfs23fhr7ntg0293039_PMCK_ST_F").
📘
Testing Tip

By default, the status of the mocked transfer will only be updated after 10 minutes.

To change the time delay: append DU_{minutes} to your transaction reference.
For Example

A transfer with a reference of "dfs23fhr7ntg0293039_PMCK" will succeed after 10 minutes.

A transfer with a reference of "dfs23fhr7ntg0293039_PMCKDU_1" will succeed after 1 minute.

A transfer with a reference of "dfs23fhr7ntg0293039_PMCK_ST_F" will fail after 10 minutes.

A transfer with a reference of "dfs23fhr7ntg0293039_PMCK_ST_FDU_1" will fail after 1 minute.

Capitec
Here are test credentials for simulating different scenarios. To mock a successful transaction, any value can be passed as the account number/phone number.

Scenarios	Account Number/Phone Number
Failed	0001234567
Fraud	1112223334
Declined	5555555555
Timeout	9876543210
Pending	1234567890
Bill Payments
Here is a test credential to help you access the DSTV biller.

Biller	Credential Type	Credentials	Item Code
DSTV	Smart card number	0025401100	CB140 or CB141

BVN Credentials
There are two main cases when verifying your customer's BVN:

Case 1: New customer consent flow i.e. initiating the customer's content.
Case 2: Existing consent flow i.e Fetching previous consent.
Use these mock credentials to test your integration for verifying users BVN information;

Case	BVN	First Name	Last Name	OTP
1	22222222280	Nibby	Certifier	111111
2	22123456789	Nibby	Certifier	-

