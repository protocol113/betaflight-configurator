import { i18n } from "../../js/localization.js";
import EscDshotDirectionMotorDriver from "./EscDshotDirectionMotorDriver.js";
import DshotCommand from "../../js/utils/DshotCommand.js";
import FC from "../../js/fc.js";
import { getMixerImageSrc } from "../../js/utils/common.js";
import $ from "jquery";

class EscDshotDirectionComponent {
    constructor(contentDiv, onLoadedCallback, motorConfig) {
        this._buttonTimeoutMs = 400;
        const motorDriverQueueIntervalMs = 100;
        const motorDriverStopMotorsPauseMs = 400;

        this._motorDriver = new EscDshotDirectionMotorDriver(
            motorConfig,
            motorDriverQueueIntervalMs,
            motorDriverStopMotorsPauseMs,
        );
        this._escProtocolIsDshot = motorConfig.escProtocolIsDshot;
        this._numberOfMotors = motorConfig.numberOfMotors;
        this._contentDiv = contentDiv;
        this._onLoadedCallback = onLoadedCallback;
        this._currentSpinningMotor = -1;
        this._selectedMotor = -1;
        this._motorIsSpinning = false;
        this._allMotorsAreSpinning = false;
        this._spinDirectionToggleIsActive = true;
        this._activationButtonTimeoutId = null;
        this._isKeyboardControlEnabled = false;
        this._spacebarPressed = false;
        this._keyboardEventHandlerBound = false;
        this._isWizardActive = false;
        this._currentMotorSpinValue = motorConfig.motorSpinValue;
        this._defaultMotorSpinValue = motorConfig.motorSpinValue;
        this._minMotorSpinValue = motorConfig.motorStopValue + 20; // Minimum safe spin value
        this._maxMotorSpinValue = 2000; // Maximum throttle value

        // Bind methods to preserve 'this' context
        this._handleWizardKeyDown = this._handleWizardKeyDown.bind(this);
        this._handleWizardKeyUp = this._handleWizardKeyUp.bind(this);
        this._handleWarningKeyDown = this._handleWarningKeyDown.bind(this);

        this._contentDiv.load("./components/EscDshotDirection/Body.html", () => {
            this._initializeDialog();
        });
    }

    static get PUSHED_BUTTON_CLASS() {
        return "pushed";
    }
    static get HIGHLIGHTED_BUTTON_CLASS() {
        return "highlighted";
    }
    static get RED_TEXT_CLASS() {
        return "red-text";
    }

    static get _BUTTON_PUSH_DOWN_EVENT_TYPE() {
        return "mousedown";
    }

    static get _BUTTON_RELEASE_EVENT_TYPE() {
        return "mouseup mouseout";
    }

    _readDom() {
        this._domStartButton = $("#escDshotDirectionDialog-Start");
        this._domStartWizardButton = $("#escDshotDirectionDialog-StartWizard");
        this._domMainContentBlock = $("#escDshotDirectionDialog-MainContent");
        this._domWarningContentBlock = $("#escDshotDirectionDialog-Warning");
        this._domMixerImg = $("#escDshotDirectionDialog-MixerPreviewImg");
        this._domMotorButtonsBlock = $("#escDshotDirectionDialog-SelectMotorButtonsWrapper");
        this._domSpinDirectionWrapper = $("#escDshotDirectionDialog-CommandsWrapper");
        this._domActionHint = $("#escDshotDirectionDialog-ActionHint");
        this._domSpinNormalButton = $("#escDshotDirectionDialog-RotationNormal");
        this._domSpinReverseButton = $("#escDshotDirectionDialog-RotationReverse");
        this._domSecondHint = $("#escDshotDirectionDialog-SecondHint");
        this._domSecondActionDiv = $("#escDshotDirectionDialog-SecondActionBlock");
        this._domConfigErrors = $("#escDshotDirectionDialog-ConfigErrors");
        this._domWrongProtocolMessage = $("#escDshotDirectionDialog-WrongProtocol");
        this._domWrongMixerMessage = $("#escDshotDirectionDialog-WrongMixer");
        this._domWrongFirmwareMessage = $("#escDshotDirectionDialog-WrongFirmware");
        this._domWizardBlock = $("#escDshotDirectionDialog-WizardDialog");
        this._domNormalDialogBlock = $("#escDshotDirectionDialog-NormalDialog");
        this._domSpinningWizard = $("#escDshotDirectionDialog-SpinningWizard");
        this._domWizardMotorButtonsBlock = $("#escDshotDirectionDialog-WizardMotorButtons");
        this._domRPMValue = $("#escDshotDirectionDialog-RPMValue");

        this._topHintText = i18n.getMessage("escDshotDirectionDialog-SelectMotor");
        this._releaseToStopText = i18n.getMessage("escDshotDirectionDialog-ReleaseToStop");
        this._releaseButtonToStopText = i18n.getMessage("escDshotDirectionDialog-ReleaseButtonToStop");
        this._normalText = i18n.getMessage("escDshotDirectionDialog-CommandNormal");
        this._reverseText = i18n.getMessage("escDshotDirectionDialog-CommandReverse");
        this._secondHintText = i18n.getMessage("escDshotDirectionDialog-SetDirectionHint");
    }

    _initializeDialog() {
        this._readDom();
        this._createMotorButtons();
        this._createWizardMotorButtons();
        this._domSecondActionDiv.toggle(false);
        i18n.localizePage();

        this._resetGui();

        // Warning screen spacebar handler
        this._setupWarningScreenKeyboard();

        // Load mixer image if FC data is available
        if (FC.MIXER_CONFIG && FC.MIXER_CONFIG.mixer !== undefined) {
            const imgSrc = getMixerImageSrc(
                FC.MIXER_CONFIG.mixer,
                FC.MIXER_CONFIG.reverseMotorDir,
                FC.CONFIG.apiVersion,
            );

            if (imgSrc) {
                console.log("Loading mixer image:", imgSrc);

                // Convert ./resources/ to /resources/ for server
                const serverPath = imgSrc.replace("./", "/");
                console.log("Server path:", serverPath);

                this._domMixerImg.on("load", () => {
                    console.log("✅ Mixer image loaded successfully!");
                    this._domMixerImg.show();
                });

                this._domMixerImg.on("error", () => {
                    console.log("❌ Failed to load mixer image - hiding");
                    this._domMixerImg.hide();
                });

                this._domMixerImg.attr("src", serverPath);
            } else {
                this._domMixerImg.hide();
            }
        } else {
            this._domMixerImg.hide();
        }

        // Initialize RPM display
        this._updateRPMDisplay();

        this._onLoadedCallback();
    }

    _activateNormalReverseButtons(timeoutMs) {
        this._activationButtonTimeoutId = setTimeout(() => {
            this._subscribeDirectionSpinButton(
                this._domSpinNormalButton,
                DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1,
                this._normalText,
            );
            this._subscribeDirectionSpinButton(
                this._domSpinReverseButton,
                DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2,
                this._reverseText,
            );
        }, timeoutMs);
    }

    _deactivateNormalReverseButtons() {
        if (null !== this._activationButtonTimeoutId) {
            clearTimeout(this._activationButtonTimeoutId);
        }

        this._domSpinNormalButton.off();
        this._domSpinReverseButton.off();
    }

    _subscribeDirectionSpinButton(button, direction, buttonText) {
        button.on(EscDshotDirectionComponent._BUTTON_PUSH_DOWN_EVENT_TYPE, () => {
            this._sendCurrentEscSpinDirection(direction);
            this._motorIsSpinning = true;
            button.text(this._releaseToStopText);
            button.addClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
            this._motorDriver.spinMotor(this._selectedMotor);
            this._domSecondHint.html(this._releaseButtonToStopText);
            this._domSecondHint.addClass(EscDshotDirectionComponent.RED_TEXT_CLASS);
        });

        button.on(EscDshotDirectionComponent._BUTTON_RELEASE_EVENT_TYPE, () => {
            if (this._motorIsSpinning) {
                button.text(buttonText);
                this._motorIsSpinning = false;
                button.removeClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
                this._motorDriver.stopAllMotors();
                this._domSecondHint.text(this._secondHintText);
                this._domSecondHint.removeClass(EscDshotDirectionComponent.RED_TEXT_CLASS);

                this._deactivateNormalReverseButtons();
                this._activateNormalReverseButtons(this._buttonTimeoutMs);
            }
        });
    }

    _sendCurrentEscSpinDirection(direction) {
        this._motorDriver.setEscSpinDirection(this._selectedMotor, direction);
    }

    _createMotorButtons() {
        this._motorButtons = {};

        for (let i = 0; i < this._numberOfMotors; i++) {
            this._addMotorButton(i + 1, i);
        }

        this._addMotorButton("All", DshotCommand.ALL_MOTORS);
    }

    _addMotorButton(buttonText, motorIndex) {
        const button = $(
            `<a href="#" class="regular-button ${EscDshotDirectionComponent.PUSHED_BUTTON_CLASS}"></a>`,
        ).text(buttonText);
        this._domMotorButtonsBlock.append(button);
        this._motorButtons[motorIndex] = button;

        button.on(EscDshotDirectionComponent._BUTTON_PUSH_DOWN_EVENT_TYPE, () => {
            this._domSecondActionDiv.toggle(true);
            this._motorIsSpinning = true;
            this._domActionHint.html(this._releaseButtonToStopText);
            this._domActionHint.addClass(EscDshotDirectionComponent.RED_TEXT_CLASS);
            this._changeSelectedMotor(motorIndex);
            button.addClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
            this._motorDriver.spinMotor(this._selectedMotor);
        });

        button.on(EscDshotDirectionComponent._BUTTON_RELEASE_EVENT_TYPE, () => {
            if (this._motorIsSpinning) {
                this._domActionHint.html(this._topHintText);
                this._domActionHint.removeClass(EscDshotDirectionComponent.RED_TEXT_CLASS);
                this._motorIsSpinning = false;
                button.removeClass(EscDshotDirectionComponent.HIGHLIGHTED_BUTTON_CLASS);
                this._motorDriver.stopAllMotors();

                this._deactivateNormalReverseButtons();
                this._activateNormalReverseButtons(this._buttonTimeoutMs);
            }
        });
    }

    _createWizardMotorButtons() {
        this._wizardMotorButtons = {};

        for (let i = 0; i < this._numberOfMotors; i++) {
            this._addWizardMotorButton(i + 1, i);
        }
    }

    _activateWizardMotorButtons(timeoutMs) {
        this._activationButtonTimeoutId = setTimeout(() => {
            for (let i = 0; i < this._numberOfMotors; i++) {
                this._activateWizardMotorButton(i);
            }
        }, timeoutMs);
    }

    _deactivateWizardMotorButtons() {
        if (null !== this._activationButtonTimeoutId) {
            clearTimeout(this._activationButtonTimeoutId);
        }

        for (let i = 0; i < this._numberOfMotors; i++) {
            const button = this._wizardMotorButtons[i];
            button.off();
        }
    }

    _addWizardMotorButton(buttonText, motorIndex) {
        const button = $(`<a href="#" class="regular-button"></a>`).text(buttonText);
        this._domWizardMotorButtonsBlock.append(button);
        this._wizardMotorButtons[motorIndex] = button;
    }

    _activateWizardMotorButton(motorIndex) {
        const button = this._wizardMotorButtons[motorIndex];

        button.on("click", () => {
            this._wizardMotorButtonClick(button, motorIndex);
        });
    }

    _wizardMotorButtonClick(button, motorIndex) {
        this._deactivateWizardMotorButtons();
        const currentlyDown = button.hasClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);

        if (currentlyDown) {
            button.removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
            this._motorDriver.setEscSpinDirection(motorIndex, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1);
        } else {
            this._motorDriver.setEscSpinDirection(motorIndex, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2);
            button.addClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }

        this._activateWizardMotorButtons(this._buttonTimeoutMs);
    }

    _changeSelectedMotor(newIndex) {
        if (this._selectedMotor >= 0) {
            this._motorButtons[this._selectedMotor].addClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }

        this._selectedMotor = newIndex;

        if (this._selectedMotor > -1) {
            this._motorButtons[this._selectedMotor].removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }
    }

    _updateRPMDisplay() {
        this._domRPMValue.text(this._currentMotorSpinValue);
    }

    _adjustRPM(delta) {
        const newValue = this._currentMotorSpinValue + delta;

        // Clamp to safe bounds
        if (newValue >= this._minMotorSpinValue && newValue <= this._maxMotorSpinValue) {
            this._currentMotorSpinValue = newValue;
            this._updateRPMDisplay();

            // Update the motor driver's spin value
            this._motorDriver.setMotorSpinValue(this._currentMotorSpinValue);

            console.log(`Motor RPM changed to: ${this._currentMotorSpinValue}`);

            // If motors are currently spinning, restart them with the new value
            if (this._spacebarPressed) {
                this._motorDriver.spinAllMotors();
            }
        }
    }

    close() {
        this._motorDriver.stopAllMotorsNow();
        this._motorDriver.deactivate();
        this._disableAllKeyboardControl();
        this._resetGui();
    }

    _disableAllKeyboardControl() {
        document.removeEventListener("keydown", this._handleWarningKeyDown, true);
        document.removeEventListener("keydown", this._handleWizardKeyDown, true);
        document.removeEventListener("keyup", this._handleWizardKeyUp, true);
        window.removeEventListener("blur", this._handleWizardKeyDown);
        this._keyboardEventHandlerBound = false;
        this._isKeyboardControlEnabled = false;
        this._spacebarPressed = false;
    }

    _setupWarningScreenKeyboard() {
        // Remove existing handler first to prevent duplicates
        document.removeEventListener("keydown", this._handleWarningKeyDown, true);

        // Use addEventListener with capture phase for better event handling
        document.addEventListener("keydown", this._handleWarningKeyDown, true);
    }

    _handleWarningKeyDown(event) {
        if (event.code === "Space" && this._domWarningContentBlock.is(":visible")) {
            event.preventDefault();
            event.stopPropagation();
            this._handleWarningSpacebar();
        }
    }

    _handleWarningSpacebar() {
        if (!this._escProtocolIsDshot) {
            return; // Don't enable keyboard shortcuts for non-DShot configurations
        }

        // Go straight to wizard spinning mode
        this._startWizardDirectly();
    }

    _enableKeyboardControl() {
        if (this._keyboardEventHandlerBound) return;

        // Use addEventListener with capture phase for reliable event handling
        document.addEventListener("keydown", this._handleWizardKeyDown, true);
        document.addEventListener("keyup", this._handleWizardKeyUp, true);

        // Add blur event to stop motors if focus is lost while spacebar is pressed
        window.addEventListener("blur", () => {
            if (this._spacebarPressed) {
                this._spacebarPressed = false;
                this._handleSpacebarRelease();
            }
        });

        this._keyboardEventHandlerBound = true;
        this._isKeyboardControlEnabled = true;
    }

    _disableKeyboardControl() {
        document.removeEventListener("keydown", this._handleWizardKeyDown, true);
        document.removeEventListener("keyup", this._handleWizardKeyUp, true);
        window.removeEventListener("blur", this._handleWizardKeyDown);
        this._keyboardEventHandlerBound = false;
        this._isKeyboardControlEnabled = false;
        this._spacebarPressed = false;
    }

    _handleWizardKeyDown(event) {
        if (!this._isKeyboardControlEnabled || !this._isWizardActive) {
            return;
        }

        // Always prevent spacebar default behavior (scrolling)
        if (event.code === "Space") {
            event.preventDefault();
            event.stopPropagation();
            if (!this._spacebarPressed && !event.repeat) {
                this._spacebarPressed = true;
                this._handleSpacebarPress();
            }
            return;
        }

        // Number keys 1-8 - motor actions
        if (event.key >= "1" && event.key <= "8" && !event.repeat) {
            event.preventDefault();
            event.stopPropagation();
            const motorIndex = parseInt(event.key) - 1;

            if (motorIndex < this._numberOfMotors) {
                this._toggleMotorDirection(motorIndex);
            }
            return;
        }

        // Plus and Minus keys - RPM adjustment
        if ((event.code === "Equal" || event.code === "NumpadAdd") && !event.repeat) {
            event.preventDefault();
            event.stopPropagation();
            this._adjustRPM(10);
            return;
        }

        if ((event.code === "Minus" || event.code === "NumpadSubtract") && !event.repeat) {
            event.preventDefault();
            event.stopPropagation();
            this._adjustRPM(-10);
            return;
        }
    }

    _handleWizardKeyUp(event) {
        if (!this._isKeyboardControlEnabled || !this._isWizardActive) {
            return;
        }

        // Spacebar release - stop motors immediately
        if (event.code === "Space") {
            event.preventDefault();
            event.stopPropagation();
            if (this._spacebarPressed) {
                this._spacebarPressed = false;
                this._handleSpacebarRelease();
            }
        }
    }

    _handleSpacebarPress() {
        this._motorDriver.spinAllMotors();
        console.log("Motors started spinning");
    }

    _handleSpacebarRelease() {
        this._motorDriver.stopAllMotorsNow();
        console.log("Motors stopped");
    }

    _toggleMotorDirection(motorIndex) {
        const button = this._wizardMotorButtons[motorIndex];
        const currentlyReversed = button.hasClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);

        if (currentlyReversed) {
            button.removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
            this._motorDriver.setEscSpinDirection(motorIndex, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1);
            console.log(`Motor ${motorIndex + 1} direction changed to: NORMAL`);
        } else {
            button.addClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
            this._motorDriver.setEscSpinDirection(motorIndex, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2);
            console.log(`Motor ${motorIndex + 1} direction changed to: REVERSED`);
        }
    }

    _resetGui() {
        this._toggleMainContent(false);
        this._domSpinningWizard.hide();
        this._isWizardActive = false;

        this._domSecondActionDiv.toggle(false);
        this._changeSelectedMotor(-1);

        // Reset to multi-motor mode (no individual mode anymore)

        // Reset RPM to default value
        this._currentMotorSpinValue = this._defaultMotorSpinValue;
        this._updateRPMDisplay();

        // Re-establish warning screen keyboard handler
        this._setupWarningScreenKeyboard();

        this._checkForConfigurationErrors();
    }

    _checkForConfigurationErrors() {
        let anyError = false;

        this._domWrongProtocolMessage.hide();
        this._domWrongMixerMessage.hide();
        this._domWrongFirmwareMessage.hide();

        if (!this._escProtocolIsDshot) {
            anyError = true;
            this._domWrongProtocolMessage.show();
        }

        if (this._numberOfMotors <= 0) {
            anyError = true;
            this._domWrongMixerMessage.show();
        }

        if (anyError) {
            this._domMainContentBlock.hide();
            this._domWarningContentBlock.hide();
            this._domConfigErrors.show();
        } else {
            this._domConfigErrors.hide();
        }
    }

    _startWizardDirectly() {
        // Reset all motor directions to normal
        for (let i = 0; i < this._numberOfMotors; i++) {
            this._wizardMotorButtons[i].removeClass(EscDshotDirectionComponent.PUSHED_BUTTON_CLASS);
        }

        this._motorDriver.setEscSpinDirection(
            DshotCommand.ALL_MOTORS,
            DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1,
        );

        // Go straight to wizard view (but don't auto-spin motors)
        this._toggleMainContent(true);
        this._domWizardBlock.show();
        this._domNormalDialogBlock.hide();
        this._domSpinningWizard.show();

        // Set wizard active state
        this._isWizardActive = true;

        this._motorDriver.activate();

        // Sync motor driver with current RPM setting
        this._motorDriver.setMotorSpinValue(this._currentMotorSpinValue);

        // Don't auto-spin - wait for spacebar press

        this._activateWizardMotorButtons(0);
        this._enableKeyboardControl();
    }

    _toggleMainContent(value) {
        this._domWarningContentBlock.toggle(!value);
        this._domMainContentBlock.toggle(value);
        this._domConfigErrors.toggle(false);
    }
}

export default EscDshotDirectionComponent;
