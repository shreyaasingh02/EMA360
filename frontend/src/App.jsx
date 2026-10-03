import { useEffect, useState } from "react";

import Header from "./components/Header";
import Scanner from "./components/Scanner";
import LongDeals from "./components/LongDeals";


import LayersPanel from "./components/LayersPanel";



import SelectedStock from "./components/SelectedStock";



import ActiveTradeTable from "./components/ActiveTradeTable";



import InputValues from "./components/InputValues";



import useActiveTrades from "./hooks/useActiveTrades";



import AnalysisModules from "./components/AnalysisModules";



import PriceChart from "./components/PriceChart";



import TradeHistory from "./components/TradeHistory";



import NiftyTable from "./components/NiftyTable";



import Footer from "./components/Footer";



import useMarketData from "./hooks/useMarketData";



import useDashboardData from "./hooks/useDashboardData";
import Login from "./components/Login";



function MarketApp({ session, onLogout }) {


    const [activePage, setActivePage] = useState("dashboard");


    /* =========================================================
  
  
  
  *     MARKET DATA*
  
  
  
  *  =========================================================* */



    const {



        stocks,



        selectedStock,



        setSelectedStock,



        currentTF,



        setCurrentTF,



        candles,



        previousPrice,



        stockData,



        dataVersion,



        marketQuotes,



        marketIndices,



        loadAllStockData,



        loadSelectedTimeframe,



        selectStock



    } = useMarketData(session?.dataSource || "nse");



    /* =========================================================
  
  
  
  *     LAYERS*
  
  
  
  *  =========================================================* */



    const [



        layersVisible,



        setLayersVisible



    ] = useState(false);



    const ALL_LAYERS = [



        "EMA",



        "VWAP",



        "RSI",



        "ADX",



        "Structure",



        "SR",



        "Volume",



        "Sentiment",



        "Strength",



        "BuySell"



    ];



    const [visibleLayers, setVisibleLayers] = useState(() => {



        try {



            const saved =



                localStorage.getItem("ema360_visible_layers");



            if (!saved) {



                return new Set(ALL_LAYERS);



            }



            const parsed =



                JSON.parse(saved);



            if (!Array.isArray(parsed)) {



                return new Set(ALL_LAYERS);



            }



            return new Set(parsed);



        } catch (error) {



            console.error(



                "Failed to load saved layers:",



                error



            );



            return new Set(ALL_LAYERS);



        }



    });



    function toggleLayer(layer) {



        setVisibleLayers(previous => {



            const next = new Set(previous);



            if (next.has(layer)) {



                next.delete(layer);



            } else {



                next.add(layer);



            }



            localStorage.setItem(



                "ema360_visible_layers",



                JSON.stringify(



                    Array.from(next)



                )



            );



            return next;



        });



    }



    /* =========================================================
  
  
  
  *   INDICATORS*
  
  
  
  ========================================================= */



    const [



        selectedIndicators,



        setSelectedIndicators



    ] = useState(



        () =>



            new Set([



                "EMA",



                "VWAP"



            ])



    );



    /* =========================================================
  
  
  
  *     DASHBOARD DATA*
  
  
  
  *  =========================================================* */



    const {



        dashboardData,



        mtfRSI,



        selectedRow



    } =



        useDashboardData(



            candles,



            selectedStock,



            currentTF,



            stockData,



            dataVersion



        );



    const {



        activeTrades,



        tradeHistory,



        activeTradeSelectedRow,



        applyActiveTrade,



        editActiveTrade,



        exitActiveTrade,



        emergencySellAll,



        deleteTradeHistory,



        selectTradeRow,



        setTradeDirection



    } = useActiveTrades({



        selectedStock,



        stockData,



        currentTF



    });



    const [



        editTradeData,



        setEditTradeData



    ] = useState(null);



    /* =========================================================
  
  
  
  *     STARTUP*
  
  
  
  *  =========================================================* */



    useEffect(



        () => {



            loadAllStockData();



        },



        [



        ]



    );



    function handleEditTrade(index) {



        const data =



            editActiveTrade(index);



        if (!data) {



            return;



        }



        setEditTradeData(



            data



        );



    }



    /* =========================================================
  
  
  
  *     STOCK CHANGE*
  
  
  
  *  =========================================================* */



    async function handleStockChange(



        stock



    ) {



        await selectStock(



            stock



        );



    }



    /* =========================================================
  
  
  
  *     TIMEFRAME CHANGE*
  
  
  
  *  =========================================================* */



    async function handleTimeframeChange(timeframe) {



        await loadSelectedTimeframe(



            timeframe,



            selectedStock



        );



        setCurrentTF(timeframe);



    }



    /* =========================================================
  
  
  
  *     LAYERS*
  
  
  
  *  =========================================================* */



    function handleToggleLayers() {



        setLayersVisible(



            previous =>



                !previous



        );



    }

    function handleNavigate(page) {

        const normalizedPage =
            String(page || "").toLowerCase();

        if (
            normalizedPage === "market" ||
            normalizedPage === "dashboard"
        ) {
            setActivePage("dashboard");
            return;
        }

        if (normalizedPage === "scanner") {
            setActivePage("scanner");
            return;
        }

        setActivePage(page);
    }

    if (activePage === "scanner") {
        return (
            <>
                <Header
                    selectedStock={selectedStock}
                    activePage={activePage}
                    onNavigate={handleNavigate}
                    currentTF={currentTF}
                    stocks={stocks}
                    stockData={stockData}
                    dataVersion={dataVersion}
                    marketQuotes={marketQuotes}
                    marketIndices={marketIndices}
                    onStockChange={handleStockChange}
                    onTimeframeChange={handleTimeframeChange}
                    onToggleLayers={handleToggleLayers}
                    session={session}
                    onLogout={onLogout}
                />

                <Scanner />
            </>
        );
    }

    if (activePage === "longDeals") {
        return (
            <>
                <Header
                    selectedStock={selectedStock}
                    activePage={activePage}
                    onNavigate={handleNavigate}
                    currentTF={currentTF}
                    stocks={stocks}
                    stockData={stockData}
                    dataVersion={dataVersion}
                    marketQuotes={marketQuotes}
                    marketIndices={marketIndices}
                    onStockChange={handleStockChange}
                    onTimeframeChange={handleTimeframeChange}
                    onToggleLayers={handleToggleLayers}
                    session={session}
                    onLogout={onLogout}
                />

                <LongDeals />
            </>
        );
    }

    return (



        <>



            <Header
                selectedStock={selectedStock}
                activePage={activePage}
                onNavigate={handleNavigate}
                currentTF={currentTF}
                stocks={stocks}
                stockData={stockData}
                dataVersion={dataVersion}
                marketQuotes={marketQuotes}
                marketIndices={marketIndices}
                onStockChange={handleStockChange}
                onTimeframeChange={handleTimeframeChange}
                onToggleLayers={handleToggleLayers}
                session={session}
                onLogout={onLogout}
            />



            <LayersPanel



                visible={



                    layersVisible



                }



                selectedIndicators={selectedIndicators}



                onIndicatorsChange={setSelectedIndicators}



                visibleLayers={visibleLayers}



                onToggleLayer={toggleLayer}



            />



            <main>



                <SelectedStock



                    selectedStock={



                        selectedStock



                    }



                    currentTF={



                        currentTF



                    }



                    dashboardData={



                        dashboardData



                    }



                    previousPrice={



                        previousPrice



                    }



                    selectedRow={



                        selectedRow



                    }



                    onEmergencySell={



                        emergencySellAll



                    }



                />



                <div className="activeTradeArea">



                    <ActiveTradeTable



                        activeTrades={activeTrades}



                        selectedStock={selectedStock}



                        activeTradeSelectedRow={activeTradeSelectedRow}



                        onRowSelect={selectTradeRow}



                        onEdit={handleEditTrade}



                        onExit={exitActiveTrade}



                        onBuy={



                            index =>



                                setTradeDirection(



                                    index,



                                    "BUY"



                                )



                        }



                        onSell={



                            index =>



                                setTradeDirection(



                                    index,



                                    "SELL"



                                )



                        }



                    />



                    <InputValues



                        stocks={stocks}



                        selectedStock={selectedStock}



                        stockData={stockData}



                        currentTF={currentTF}



                        editTradeData={editTradeData}



                        onApplyTrade={



                            data => {



                                const success =



                                    applyActiveTrade(



                                        data



                                    );



                                if (success) {



                                    setEditTradeData(



                                        null



                                    );



                                }



                                return success;



                            }



                        }



                    />



                </div>



                <AnalysisModules



                    dashboardData={



                        dashboardData



                    }



                    mtfRSI={



                        mtfRSI



                    }



                    visibleLayers={visibleLayers}



                />



                <PriceChart



                    selectedStock={selectedStock}



                    currentTF={currentTF}



                    candles={candles}



                    selectedIndicators={selectedIndicators}



                    onIndicatorsChange={



                        setSelectedIndicators



                    }



                    onTimeframeChange={



                        handleTimeframeChange



                    }



                    dashboardData={dashboardData}



                    mtfRSI={mtfRSI}



                />



                <TradeHistory



                    tradeHistory={tradeHistory}



                    onDeleteTrade={deleteTradeHistory}



                />



                <NiftyTable



                    stocks={stocks}



                    stockData={stockData}



                    currentTF={currentTF}



                    selectedStock={selectedStock}



                    onStockSelect={handleStockChange}



                />



            </main>



            <Footer />



        </>



    );



}

function App() {

    const API_URL =
        import.meta.env.VITE_API_URL ||
        "http://localhost:3000";


    const [session, setSession] =
        useState(null);


    const [checkingAuth, setCheckingAuth] =
        useState(true);


    useEffect(() => {

        async function checkAuthentication() {

            try {

                const response =
                    await fetch(
                        `${API_URL}/api/auth/me`,
                        {
                            credentials: "include"
                        }
                    );


                if (!response.ok) {

                    setSession(null);

                    return;

                }


                const data =
                    await response.json();


                if (
                    data.authenticated &&
                    data.user
                ) {

                    setSession({

                        mode:
                            data.user.dataSource === "nse"
                                ? "guest"
                                : "broker",

                        userType:
                            data.user.dataSource === "nse"
                                ? "guest"
                                : "login",

                        email:
                            data.user.email,

                        brokerId:
                            data.user.clientId,

                        dataSource:
                            data.user.dataSource

                    });

                }

                else {

                    setSession(null);

                }

            }

            catch (error) {

                console.error(
                    "Authentication check failed:",
                    error
                );

                setSession(null);

            }

            finally {

                setCheckingAuth(false);

            }

        }


        checkAuthentication();

    }, [API_URL]);


    async function handleLogout() {

        try {

            await fetch(
                `${API_URL}/api/auth/logout`,
                {
                    method: "POST",
                    credentials: "include"
                }
            );

        }

        catch (error) {

            console.error(
                "Logout error:",
                error
            );

        }


        setSession(null);

    }


    if (checkingAuth) {

        return (

            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#07111f",
                    color: "#18d6a5",
                    fontFamily: "Arial, sans-serif",
                    fontSize: "14px",
                    fontWeight: "700"
                }}
            >
                Connecting to EMA360...
            </div>

        );

    }


    if (!session) {

        return (
            <Login
                onAuthenticated={
                    setSession
                }
            />
        );

    }


    return (

        <MarketApp
            session={session}
            onLogout={
                handleLogout
            }
        />

    );

}

export default App;