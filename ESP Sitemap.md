flowchart TD
    subgraph AUTH["1. Authentication"]
        LOGIN["1.1 Login"]
        LOGIN --> LOGIN_USER["Username + Password"]
        LOGIN --> LOGIN_ALT["Account # + Last 4 Phone/SSN"]
        

        RECOVERY["1.2 Account Recovery"]
        RECOVERY --> FORGOT_USER["Forgot Username"]
        RECOVERY --> FORGOT_PASS["Forgot Password"]
        
        CREATE["1.3 Account Creation"]
        CREATE --> CREATE_ACCT["Create Account"]
        CREATE --> LINK_ACCT["Link Multiple Accounts"]
        
        LEGAL["1.4 Legal"]
        LEGAL --> PRIVACY["Privacy Policy"]
        LEGAL --> TAX["Tax Document Info (1098)"]
    end
    
    subgraph NAV["2. Global Navigation"]
        NAV_PAY["Make a Payment"]
        NAV_ACCT["Account Info"]
        NAV_REPORTS["Reports"]
        NAV_CONTACT["Contact Us"]
        NAV_LOGOUT["Logout"]
    end
    
    subgraph DASH["3. Dashboard (Express View)"]
        DASH_URL["ExpressView.aspx"]
        DASH_URL --> DASH_ACCT["Account Number"]
        DASH_URL --> DASH_STATUS["Loan Status"]
        DASH_URL --> DASH_PAY["Payment Summary"]
        DASH_URL --> DASH_BAL["Balance Summary"]
        DASH_URL --> DASH_TRANS["Last Transaction"]
        DASH_URL --> DASH_YTD["YTD Interest Paid"]
        DASH_URL --> DASH_PRIOR["Prior-Year Interest"]
        DASH_URL --> DASH_TERM["Remaining Term"]
    end
    
    subgraph PAYMENTS["4. Payments"]
        subgraph MAKE_PAY["4.1 Make a Payment"]
            PAY_URL["PaymentProcessing.aspx"]
            PAY_URL --> PAY_CONTEXT["Account Context"]
            PAY_URL --> PAY_PENDING["Pending Payments"]
            PAY_URL --> PAY_TYPE["Payment Type"]
            PAY_URL --> PAY_METHOD["Payment Method"]
            PAY_URL --> PAY_AUTH["Authorization Rules"]
            PAY_URL --> PAY_SUREPAY["SurePay Handling"]
        end
        
        subgraph MANAGE_PAY["4.2 Manage Payment Methods"]
            MANAGE_URL["ManagePayments.aspx"]
            
            CARDS["Credit Cards"]
            CARDS --> CARDS_VIEW["View Stored Cards"]
            CARDS --> CARDS_ADD["Add Card"]
            
            BANK["Bank Accounts (ACH)"]
            BANK --> BANK_VIEW["View Accounts"]
            BANK --> BANK_ADD["Add Account"]
            BANK --> BANK_UPDATE["Update Account"]
            BANK --> BANK_DELETE["Delete Account"]
        end
    end
    
    subgraph ACCOUNT["5. Account Info"]
        ACCT_URL["AccountAddress.aspx"]
        
        PERSONAL["5.1 Personal Info"]
        PERSONAL --> PERSONAL_NUM["Account Number"]
        PERSONAL --> PERSONAL_PRI["Primary Name"]
        PERSONAL --> PERSONAL_SEC["Secondary Name"]
        
        ADDRESS["5.2 Address"]
        ADDRESS --> ADDR_COUNTRY["Country"]
        ADDRESS --> ADDR_STREET["Street Address"]
        ADDRESS --> ADDR_CITY["City / State / Postal"]
        ADDRESS --> ADDR_UPDATE["Update Address"]
        
        PHONE["5.3 Phone Numbers"]
        PHONE --> PHONE_VIEW["View / Add / Remove"]
        
        EMAIL["5.4 Email Addresses"]
        EMAIL --> EMAIL_VIEW["View / Add / Remove"]
        EMAIL --> EMAIL_ESTAT["eStatements Opt-In"]
        
        PAPERLESS["5.5 Paperless Consent"]
        PAPERLESS --> PAPER_AGREE["Opt In / Opt Out"]
    end
    
    subgraph LOAN["6. Loan History"]
        LOAN_URL["LoanHistory.aspx"]
        
        LOAN_SUM["6.1 Loan Summary"]
        LOAN_SUM --> LOAN_NUM["Loan Number / Lender"]
        LOAN_SUM --> LOAN_AMOUNTS["Amounts / Terms"]
        LOAN_SUM --> LOAN_RATE["Interest Rate"]
        
        LOAN_BAL["6.2 Current Balances"]
        LOAN_BAL --> BAL_PRIN["Principal"]
        LOAN_BAL --> BAL_INT["Accrued Interest"]
        LOAN_BAL --> BAL_LATE["Late Charges"]
        LOAN_BAL --> BAL_PAYOFF["Payoff Amount"]
        
        LOAN_TOTALS["6.3 Grand Totals"]
        LOAN_TOTALS --> TOT_PRIN["Total Principal Paid"]
        LOAN_TOTALS --> TOT_INT["Total Interest Paid"]
        
        LOAN_LEDGER["6.4 Transaction Ledger"]
        LOAN_LEDGER --> LEDGER_YEAR["Grouped by Year"]
        LOAN_LEDGER --> LEDGER_DETAIL["Payment Details"]
    end
    
    subgraph BILLING["7. Billing History"]
        BILL_URL["MaintenanceHistory.aspx"]
        BILL_URL --> BILL_TRANS["Billing Transactions"]
    end
    
    subgraph ESTATEMENTS["8. eStatements"]
        ESTAT_URL["EStatements.aspx"]
        
        DOCS["Document Types"]
        DOCS --> DOC_MONTHLY["Monthly Statements"]
        DOCS --> DOC_SUREPAY["SurePay Letters"]
        DOCS --> DOC_NOTICES["Notices"]
        
        FEAT["Features"]
        FEAT --> FEAT_LIST["Chronological List"]
        FEAT --> FEAT_DL["View / Download"]
    end
    
    subgraph EXIT["9. Contact & Exit"]
        CONTACT["Contact Us"]
        CONTACT_URL["ContactUS.aspx"]
        
        LOGOUT["Logout"]
        LOGOUT_URL["Logout.aspx"]
    end
    
    %% Main flow connections
    AUTH --> NAV
    NAV --> DASH
    NAV_PAY --> PAYMENTS
    NAV_ACCT --> ACCOUNT
    NAV_REPORTS --> LOAN
    NAV_REPORTS --> BILLING
    NAV_REPORTS --> ESTATEMENTS
    NAV_CONTACT --> EXIT
    NAV_LOGOUT --> EXIT