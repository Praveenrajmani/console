// This file is part of MinIO Console Server
// Copyright (c) 2021 MinIO, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
import React, { useState, useEffect } from "react";
import {
  IMessageEvent,
  w3cwebsocket as W3CWebSocket,
  ICloseEvent,
} from "websocket";
import { AppState } from "../../../store";
import { connect } from "react-redux";
import { healthInfoMessageReceived, healthInfoResetMessage } from "./actions";
import {
  HealthInfoMessage,
  DiagStatInProgress,
  DiagStatSuccess,
  DiagStatError,
} from "./types";
import { Theme } from "@mui/material/styles";
import createStyles from "@mui/styles/createStyles";
import withStyles from "@mui/styles/withStyles";
import {
  wsProtocol,
  WSCloseInternalServerErr,
  WSClosePolicyViolation,
  WSCloseAbnormalClosure,
} from "../../../utils/wsUtils";
import {
  actionsTray,
  containerForHeader,
} from "../Common/FormComponents/common/styleLibrary";
import { Grid, Button } from "@mui/material";
import PageHeader from "../Common/PageHeader/PageHeader";
import { setSnackBarMessage, setServerDiagStat } from "../../../actions";
import CircularProgress from "@mui/material/CircularProgress";

const styles = (theme: Theme) =>
  createStyles({
    logList: {
      background: "#fff",
      minHeight: 400,
      height: "calc(100vh - 270px)",
      overflow: "auto",
      fontSize: 13,
      padding: "25px 45px",
      border: "1px solid #EAEDEE",
      borderRadius: 4,
    },
    loading: {
      paddingTop: 8,
      paddingLeft: 40,
    },
    buttons: {
      justifyContent: "flex-start",
      gap: 20,
    },
    ...actionsTray,
    ...containerForHeader(theme.spacing(4)),
  });

const download = (filename: string, text: string) => {
  let element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};

interface IHealthInfo {
  classes: any;
  healthInfoMessageReceived: typeof healthInfoMessageReceived;
  healthInfoResetMessage: typeof healthInfoResetMessage;
  message: HealthInfoMessage;
  namespace: string;
  tenant: string;
  setSnackBarMessage: typeof setSnackBarMessage;
  setServerDiagStat: typeof setServerDiagStat;
  serverDiagnosticStatus: string;
}

const HealthInfo = ({
  classes,
  healthInfoMessageReceived,
  healthInfoResetMessage,
  message,
  setSnackBarMessage,
  setServerDiagStat,
  serverDiagnosticStatus,
}: IHealthInfo) => {
  const [startDiagnostic, setStartDiagnostic] = useState(false);
  const [downloadDisabled, setDownloadDisabled] = useState(true);

  useEffect(() => {
    if (
      serverDiagnosticStatus === DiagStatSuccess &&
      message !== ({} as HealthInfoMessage)
    ) {
      // Allow download of diagnostics file only when
      // it succeded fetching all the results and info is not empty.
      setDownloadDisabled(false);
    }
    if (serverDiagnosticStatus === DiagStatInProgress) {
      // Disable Start Diagnotic and Disable Download buttons
      // if a Diagnosis is in progress.
      setDownloadDisabled(true);
    }
    setStartDiagnostic(false);
  }, [serverDiagnosticStatus, message]);

  useEffect(() => {
    if (startDiagnostic) {
      healthInfoResetMessage();
      const url = new URL(window.location.toString());
      const isDev = process.env.NODE_ENV === "development";
      const port = isDev ? "9090" : url.port;

      const wsProt = wsProtocol(url.protocol);

      const c = new W3CWebSocket(
        `${wsProt}://${url.hostname}:${port}/ws/health-info?deadline=1h`
      );

      let interval: any | null = null;
      if (c !== null) {
        c.onopen = () => {
          console.log("WebSocket Client Connected");
          c.send("ok");
          interval = setInterval(() => {
            c.send("ok");
          }, 10 * 1000);
          setSnackBarMessage(
            "Diagnostic started. Please do not refresh page during diagnosis."
          );
          setServerDiagStat(DiagStatInProgress);
        };
        c.onmessage = (message: IMessageEvent) => {
          let m: HealthInfoMessage = JSON.parse(message.data.toString());
          m.timestamp = new Date(m.timestamp.toString());
          healthInfoMessageReceived(m);
        };
        c.onerror = (error: Error) => {
          console.log("error closing websocket:", error.message);
          c.close(1000);
          clearInterval(interval);
          setServerDiagStat(DiagStatError);
        };
        c.onclose = (event: ICloseEvent) => {
          clearInterval(interval);
          if (
            event.code === WSCloseInternalServerErr ||
            event.code === WSClosePolicyViolation ||
            event.code === WSCloseAbnormalClosure
          ) {
            // handle close with error
            console.log("connection closed by server with code:", event.code);
            setSnackBarMessage(
              "An error occurred while getting Diagnostic file."
            );
            setServerDiagStat(DiagStatError);
          } else {
            console.log("connection closed by server");
            setSnackBarMessage("Diagnostic file is ready to be downloaded.");
            setServerDiagStat(DiagStatSuccess);
          }
        };
      }
    } else {
      // reset start status
      setStartDiagnostic(false);
    }
  }, [
    healthInfoMessageReceived,
    healthInfoResetMessage,
    startDiagnostic,
    setSnackBarMessage,
    setServerDiagStat,
  ]);

  return (
    <React.Fragment>
      <PageHeader label="Diagnostic" />

      <Grid container>
        <Grid item xs={12} className={classes.container}>
          <Grid container className={classes.buttons}>
            <Grid key="start-diag" item>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={startDiagnostic}
                onClick={() => setStartDiagnostic(true)}
              >
                Start Diagnostic
              </Button>
            </Grid>
            <Grid key="start-download" item>
              {serverDiagnosticStatus === DiagStatInProgress ? (
                <div className={classes.loading}>
                  <CircularProgress size={25} />
                </div>
              ) : (
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    download(
                      "diagnostic.json",
                      JSON.stringify(message, null, 2)
                    );
                  }}
                  disabled={downloadDisabled}
                >
                  Download
                </Button>
              )}
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </React.Fragment>
  );
};

const mapState = (state: AppState) => ({
  message: state.healthInfo.message,
  serverDiagnosticStatus: state.system.serverDiagnosticStatus,
});

const connector = connect(mapState, {
  healthInfoMessageReceived: healthInfoMessageReceived,
  healthInfoResetMessage: healthInfoResetMessage,
  setSnackBarMessage,
  setServerDiagStat,
});

export default connector(withStyles(styles)(HealthInfo));
